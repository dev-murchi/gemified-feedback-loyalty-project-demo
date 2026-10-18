import {
  CONFLICT_CONSTRAINTS,
  conflictOnUniqueViolation,
} from '../../../src/platform/postgres/unique-violation.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { RecordingLogger } from '../../support/recording-logger.js';

/** What node-postgres throws: an Error carrying the SQLSTATE code and the constraint name. */
const databaseError = (code: string, constraint?: string): Error =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    code,
    ...(constraint === undefined ? {} : { constraint }),
  });

const UNIQUE = '23505';

describe('conflictOnUniqueViolation (docs/07 §6)', () => {
  const logger = new RecordingLogger();
  const context = (aggregateId = 'wallet-1', key = 'reward:feedback-1') => ({
    logger,
    aggregateId,
    key,
  });
  // Rejects with whatever it is given, non-errors included: a driver can throw anything.
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  const failingWith = (error: unknown) => () => Promise.reject(error);

  beforeEach(() => {
    logger.warnings.length = 0;
  });

  it.each([
    'ledger_entries_idempotency_key_uq',
    'device_keys_key_identifier_uq',
  ])(
    'turns a violation of %s into a concurrency conflict and logs the constraint and the key',
    async (constraint) => {
      // When a statement violates one of the two named constraints
      const run = conflictOnUniqueViolation(
        failingWith(databaseError(UNIQUE, constraint)),
        context(),
      );

      // Then the caller gets a conflict for the aggregate, and one warning says which and why
      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      await expect(run).rejects.toMatchObject({ aggregateId: 'wallet-1' });
      expect(logger.warnings.at(0)).toEqual({
        message: 'Unique constraint hit; retrying the unit of work',
        fields: { constraint, key: 'reward:feedback-1' },
      });
    },
  );

  it.each([
    'qr_codes_token_uq',
    'feedbacks_user_id_idempotency_key_uq',
    'device_keys_key_identifier_uq_old',
    'ledger_entries_pkey',
  ])(
    'rethrows a violation of any other constraint (%s) unchanged and logs nothing',
    async (constraint) => {
      // Given a unique violation of a constraint that is no concurrency symptom
      const error = databaseError(UNIQUE, constraint);

      // When it happens
      const run = conflictOnUniqueViolation(failingWith(error), context());

      // Then the very same error reaches the caller
      await expect(run).rejects.toBe(error);
      expect(logger.warnings).toEqual([]);
    },
  );

  it('rethrows a unique violation that names no constraint', async () => {
    const error = databaseError(UNIQUE);
    await expect(
      conflictOnUniqueViolation(failingWith(error), context()),
    ).rejects.toBe(error);
  });

  it('does not treat another kind of database error as a conflict, even for a conflict constraint name', async () => {
    // Given a foreign key violation (23503) that carries the ledger constraint's name
    const error = databaseError('23503', 'ledger_entries_idempotency_key_uq');

    // Then it stays an error
    await expect(
      conflictOnUniqueViolation(failingWith(error), context()),
    ).rejects.toBe(error);
    expect(logger.warnings).toEqual([]);
  });

  it.each([
    new Error('connection terminated'),
    'not an error',
    null,
    undefined,
  ])('rethrows %s unchanged', async (thrown) => {
    await expect(
      conflictOnUniqueViolation(failingWith(thrown), context()),
    ).rejects.toBe(thrown);
  });

  it('returns what the statement returns when nothing is violated', async () => {
    expect(
      await conflictOnUniqueViolation(() => Promise.resolve(42), context()),
    ).toBe(42);
  });

  it('knows exactly the two constraints docs/07 §6 names', () => {
    expect([...CONFLICT_CONSTRAINTS].sort()).toEqual([
      'device_keys_key_identifier_uq',
      'ledger_entries_idempotency_key_uq',
    ]);
  });
});
