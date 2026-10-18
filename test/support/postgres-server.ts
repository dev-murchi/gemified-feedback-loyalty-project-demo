import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import pg from 'pg';

/** The image docker-compose.yml uses; Testcontainers starts it on a free port. */
const POSTGRES_IMAGE = 'postgres:14-alpine';

/** The database the integration global setup migrates; each test file copies it. */
export const MIGRATED_TEMPLATE = 'migrated_template';

export const startPostgres = (): Promise<StartedPostgreSqlContainer> =>
  new PostgreSqlContainer(POSTGRES_IMAGE).start();

/** The same server and credentials, another database. */
export function urlOfDatabase(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Runs one statement on its own connection, e.g. CREATE DATABASE, which no transaction allows. */
export async function runAlone(url: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
