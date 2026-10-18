// The unique-violation mapping against errors a real PostgreSQL raises. The two constraint names
// are recreated on tables of this file's own empty database; the real tables come with their
// slices. The mapping rules themselves are unit tested (test/unit/platform/unique-violation.spec.ts).

import { conflictOnUniqueViolation } from '../../../src/platform/postgres/unique-violation.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { freshDatabase, type TestDatabase } from '../../support/postgres.js';

let testDb: TestDatabase;

beforeAll(async () => {
  // Empty, not a copy of the migrated schema: the real constraints will exist there.
  testDb = await freshDatabase({ migrated: false });
  const { db } = testDb;
  await db.query(
    `CREATE TABLE ledger_probe (
       id integer PRIMARY KEY, idempotency_key text NOT NULL,
       CONSTRAINT ledger_entries_idempotency_key_uq UNIQUE (idempotency_key))`,
  );
  await db.query(
    `CREATE TABLE device_probe (
       id integer PRIMARY KEY, key_identifier text NOT NULL,
       CONSTRAINT device_keys_key_identifier_uq UNIQUE (key_identifier))`,
  );
  await db.query(
    `CREATE TABLE token_probe (
       id integer PRIMARY KEY, token text NOT NULL,
       CONSTRAINT qr_codes_token_uq UNIQUE (token))`,
  );
});

afterAll(() => testDb.drop());

const context = () => ({
  logger: testDb.logger,
  aggregateId: 'aggregate-1',
  key: 'the-key',
});

/** Inserts the same value twice in one transaction; the second statement is the violation. */
const insertTwice = (table: string, column: string) =>
  testDb.db.transaction(async () => {
    const insert = (id: number) =>
      conflictOnUniqueViolation(
        () =>
          testDb.db.query(
            `INSERT INTO ${table} (id, ${column}) VALUES ($1, 'same')`,
            [id],
          ),
        context(),
      );
    await insert(1);
    await insert(2);
  });

describe('conflictOnUniqueViolation (PostgreSQL)', () => {
  it.each([
    ['ledger_probe', 'idempotency_key', 'ledger_entries_idempotency_key_uq'],
    ['device_probe', 'key_identifier', 'device_keys_key_identifier_uq'],
  ])(
    'turns the real violation on %s into a concurrency conflict and rolls the transaction back',
    async (table, column, constraint) => {
      // When a real unique violation of a named constraint happens inside a transaction
      const run = insertTwice(table, column);

      // Then it is a concurrency conflict, logged with the constraint, and nothing is stored
      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect(testDb.logger.warnings.at(-1)?.fields).toEqual({
        constraint,
        key: 'the-key',
      });
      const { rows } = await testDb.db.query(`SELECT 1 FROM ${table}`);
      expect(rows).toEqual([]);
    },
  );

  it('leaves the real violation of any other constraint as the database error', async () => {
    // When a real unique violation of another constraint happens
    const run = insertTwice('token_probe', 'token');

    // Then the database error reaches the caller, naming its constraint
    await expect(run).rejects.not.toBeInstanceOf(ConcurrencyConflictError);
    await expect(run).rejects.toMatchObject({
      code: '23505',
      constraint: 'qr_codes_token_uq',
    });
  });
});
