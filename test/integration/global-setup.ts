import type { TestProject } from 'vitest/node';
import { migrate } from '../../src/platform/postgres/migrate.js';
import { createPgDatabase } from '../../src/platform/postgres/pg-database.js';
import {
  MIGRATED_TEMPLATE,
  runAlone,
  startPostgres,
  urlOfDatabase,
} from '../support/postgres-server.js';
import { RecordingLogger } from '../support/recording-logger.js';
import { startRedis } from '../support/redis-server.js';

/**
 * One PostgreSQL server and one Redis server for the whole integration run, started once so that a
 * slow container start cannot fail one test file. The project's migrations are applied once to a
 * template database that each test file copies (test/support/postgres.ts); each file takes a
 * Redis database of its own (test/support/redis.ts).
 */
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const [postgres, redis] = await Promise.all([startPostgres(), startRedis()]);
  const server = postgres.getConnectionUri();
  await runAlone(server, `CREATE DATABASE ${MIGRATED_TEMPLATE}`);
  const logger = new RecordingLogger();
  const template = createPgDatabase(
    { url: urlOfDatabase(server, MIGRATED_TEMPLATE) },
    logger,
  );
  try {
    await migrate({ db: template, directory: 'db/migrations', logger });
  } finally {
    // A template must have no open connections while it is copied.
    await template.end();
  }
  project.provide('postgresUrl', server);
  project.provide('redisUrl', redis.getConnectionUrl());
  return async () => {
    await Promise.all([postgres.stop(), redis.stop()]);
  };
}
