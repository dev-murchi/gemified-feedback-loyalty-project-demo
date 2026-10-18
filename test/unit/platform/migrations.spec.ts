import {
  inVersionOrder,
  migrationOf,
  pendingMigrations,
  type Migration,
} from '../../../src/platform/postgres/migrations.js';

const outbox = migrationOf('0001_outbox.sql', 'CREATE TABLE outbox ();');
const catalog = migrationOf('0002_catalog.sql', 'CREATE TABLE brands ();');
const wallets = migrationOf('0003_wallets.sql', 'CREATE TABLE wallets ();');

const applied = (migration: Migration) => ({
  version: migration.version,
  name: migration.name,
  checksum: migration.checksum,
});

describe('migration files', () => {
  it('takes the version and name from the file name and fingerprints the content', () => {
    // Given two files that differ only in content
    const changed = migrationOf(
      '0001_outbox.sql',
      'CREATE TABLE outbox (x int);',
    );

    // Then version and name come from the name, and the checksums differ
    expect(outbox).toMatchObject({ version: 1, name: 'outbox' });
    expect(outbox.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(changed.checksum).not.toBe(outbox.checksum);
  });

  it.each(['1_outbox.sql', '0001-outbox.sql', '0001_Outbox.sql', '0001_.sql'])(
    'refuses the badly named file %s',
    (fileName) => {
      expect(() => migrationOf(fileName, '')).toThrow('is not named');
    },
  );

  it('sorts by version and refuses two files with the same version', () => {
    expect(inVersionOrder([wallets, outbox, catalog])).toEqual([
      outbox,
      catalog,
      wallets,
    ]);
    const twin = migrationOf('0002_other.sql', 'SELECT 1;');
    expect(() => inVersionOrder([catalog, twin])).toThrow(
      'Two migrations have version 2',
    );
  });
});

describe('pendingMigrations', () => {
  const all = [outbox, catalog, wallets];

  it('gives every migration to a new database and the rest to a migrated one', () => {
    expect(pendingMigrations(all, [])).toEqual(all);
    expect(pendingMigrations(all, [applied(outbox)])).toEqual([
      catalog,
      wallets,
    ]);
    expect(pendingMigrations(all, all.map(applied))).toEqual([]);
  });

  it('refuses a migration that was changed after it was applied', () => {
    const edited = { ...applied(outbox), checksum: 'f'.repeat(64) };
    expect(() => pendingMigrations(all, [edited])).toThrow(
      'Migration 1 (outbox) was changed after it was applied',
    );
  });

  it('refuses a database that has a migration this build does not have', () => {
    expect(() =>
      pendingMigrations([outbox], [applied(outbox), applied(catalog)]),
    ).toThrow(
      'Migration 2 (catalog) is applied but this build does not have it',
    );
  });

  it('refuses a new migration older than an applied one', () => {
    expect(() =>
      pendingMigrations(all, [applied(outbox), applied(wallets)]),
    ).toThrow('Migration 2 (catalog) is older than applied migration 3');
  });
});
