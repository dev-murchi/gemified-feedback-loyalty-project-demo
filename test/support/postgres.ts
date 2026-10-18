import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import {
  createPgDatabase,
  type PgDatabase,
} from '../../src/platform/postgres/pg-database.js';
import {
  MIGRATED_TEMPLATE,
  runAlone,
  urlOfDatabase,
} from './postgres-server.js';
import { RecordingLogger } from './recording-logger.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The integration PostgreSQL server (test/integration/global-setup.ts), its default database. */
    postgresUrl: string;
  }
}

export interface TestDatabase {
  readonly db: PgDatabase;
  readonly url: string;
  readonly logger: RecordingLogger;
  /** Closes the pool and drops the database. */
  drop(): Promise<void>;
}

export interface TestDatabaseOptions {
  /** false: an empty database instead of a copy of the migrated schema. */
  readonly migrated?: boolean;
  readonly maxConnections?: number;
}

/**
 * A database of its own on the shared test server, so test files running in parallel never meet:
 * a copy of the migrated template (fast, no migrations per file), or an empty one.
 */
export async function freshDatabase(
  options: TestDatabaseOptions = {},
): Promise<TestDatabase> {
  const server = inject('postgresUrl');
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const template = options.migrated === false ? 'template1' : MIGRATED_TEMPLATE;
  await runAlone(server, `CREATE DATABASE ${name} TEMPLATE ${template}`);
  const url = urlOfDatabase(server, name);
  const logger = new RecordingLogger();
  const { maxConnections } = options;
  const db = createPgDatabase(
    { url, ...(maxConnections === undefined ? {} : { maxConnections }) },
    logger,
  );
  return {
    db,
    url,
    logger,
    drop: async () => {
      await db.end();
      await runAlone(server, `DROP DATABASE ${name} WITH (FORCE)`);
    },
  };
}

/** Empties every table except the migration history, so each test starts from a clean schema. */
export async function emptyTables(db: PgDatabase): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
  await db.query(`TRUNCATE ${tables} CASCADE`);
}
