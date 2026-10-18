// The migration runner against a real, initially empty database. The rules for which migrations
// are pending are unit tested (test/unit/platform/migrations.spec.ts).

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../../../src/platform/postgres/migrate.js';
import { createPgDatabase } from '../../../src/platform/postgres/pg-database.js';
import { freshDatabase, type TestDatabase } from '../../support/postgres.js';

let directory: string;
let testDb: TestDatabase;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'migrations-'));
  testDb = await freshDatabase({ migrated: false });
});

afterEach(async () => {
  await testDb.drop();
  await rm(directory, { recursive: true, force: true });
});

const file = (name: string, sql: string) =>
  writeFile(join(directory, name), sql);

const migrateNow = (db = testDb.db) =>
  migrate({ db, directory, logger: testDb.logger });

const tables = async () =>
  (
    await testDb.db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    )
  ).rows.map((row) => row.tablename);

const history = async () =>
  (
    await testDb.db.query<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    )
  ).rows.map((row) => row.version);

describe('migrate (PostgreSQL)', () => {
  it('applies pending migrations in version order, records them, and applies nothing the second time', async () => {
    // Given two migrations, the second depending on the first
    await file(
      '0002_b.sql',
      'CREATE TABLE b (a_id integer REFERENCES a (id));',
    );
    await file('0001_a.sql', 'CREATE TABLE a (id integer PRIMARY KEY);');

    // When the database is migrated twice
    const first = await migrateNow();
    const second = await migrateNow();

    // Then both were applied once, in order, recorded and logged
    expect(first.map((m) => m.version)).toEqual([1, 2]);
    expect(second).toEqual([]);
    expect(await tables()).toEqual(['a', 'b', 'schema_migrations']);
    expect(await history()).toEqual([1, 2]);
    expect(testDb.logger.infos).toEqual([
      { message: 'Migration applied', fields: { version: 1, name: 'a' } },
      { message: 'Migration applied', fields: { version: 2, name: 'b' } },
    ]);
  });

  it('applies nothing when one migration of the run fails', async () => {
    // Given a valid migration followed by a broken one
    await file('0001_a.sql', 'CREATE TABLE a (id integer PRIMARY KEY);');
    await file('0002_broken.sql', 'CREATE TABLE b (id no_such_type);');

    // When the database is migrated
    const run = migrateNow();

    // Then it fails and the database is as empty as before, history included
    await expect(run).rejects.toThrow('no_such_type');
    expect(await tables()).toEqual([]);
    expect(testDb.logger.infos).toEqual([]);
  });

  it('refuses to go on when an applied migration was edited, and changes nothing', async () => {
    // Given an applied migration that is then edited, and a new one
    await file('0001_a.sql', 'CREATE TABLE a (id integer PRIMARY KEY);');
    await migrateNow();
    await file('0001_a.sql', 'CREATE TABLE a (id bigint PRIMARY KEY);');
    await file('0002_b.sql', 'CREATE TABLE b (id integer);');

    // When the database is migrated again
    const run = migrateNow();

    // Then it is refused and the new migration is not applied either
    await expect(run).rejects.toThrow('was changed after it was applied');
    expect(await tables()).toEqual(['a', 'schema_migrations']);
  });

  it('applies each migration once when two processes migrate at the same time', async () => {
    // Given two migrations and a second process with its own connections
    await file('0001_a.sql', 'CREATE TABLE a (id integer PRIMARY KEY);');
    await file('0002_b.sql', 'CREATE TABLE b (id integer PRIMARY KEY);');
    const other = createPgDatabase({ url: testDb.url }, testDb.logger);

    // When both migrate at once
    const results = await Promise.all([migrateNow(), migrateNow(other)]);
    await other.end();

    // Then one applied both migrations and the other found nothing to do
    expect(results.map((r) => r.length).sort()).toEqual([0, 2]);
    expect(await history()).toEqual([1, 2]);
  });

  it("migrates an empty database with the project's migrations", async () => {
    // When the project's migrations are applied to an empty database
    await migrate({
      db: testDb.db,
      directory: 'db/migrations',
      logger: testDb.logger,
    });

    // Then the outbox exists
    expect(await tables()).toContain('outbox');
  });
});
