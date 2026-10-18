import type { Logger } from '../../shared-kernel/logger.js';
import {
  pendingMigrations,
  readMigrations,
  type AppliedMigration,
  type Migration,
} from './migrations.js';
import type { PgDatabase } from './pg-database.js';

/** Any fixed number; every process that migrates this database waits on the same lock. */
const MIGRATION_LOCK = 4_202_611;

const CREATE_HISTORY = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

export interface MigrateDeps {
  readonly db: PgDatabase;
  /** Where the `NNNN_name.sql` files are, normally `db/migrations`. */
  readonly directory: string;
  readonly logger: Logger;
}

async function apply(db: PgDatabase, migration: Migration): Promise<void> {
  await db.query(migration.sql);
  await db.query(
    'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
    [migration.version, migration.name, migration.checksum],
  );
}

/**
 * Applies the pending migrations in one transaction (PostgreSQL DDL is transactional): either all
 * of them are applied and recorded, or none. A transaction-scoped advisory lock makes a second
 * process that migrates at the same time wait, then find nothing left to do. Statements that
 * cannot run in a transaction (e.g. CREATE INDEX CONCURRENTLY) are therefore not supported.
 */
export async function migrate(
  deps: MigrateDeps,
): Promise<readonly Migration[]> {
  const available = await readMigrations(deps.directory);
  const { db } = deps;
  const applied = await db.transaction(async () => {
    await db.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await db.query(CREATE_HISTORY);
    const history = await db.query<AppliedMigration>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    );
    const pending = pendingMigrations(available, history.rows);
    for (const migration of pending) await apply(db, migration);
    return pending;
  });
  applied.forEach(({ version, name }) =>
    deps.logger.info('Migration applied', { version, name }),
  );
  return applied;
}
