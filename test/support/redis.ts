import { randomUUID } from 'node:crypto';
import type { RedisOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The run's Redis server, `redis://host:port` (the global setup of the integration and e2e projects). */
    redisUrl: string;
  }
}

/** Redis offers 16 numbered databases by default; 0 is left alone, a file takes 1 to 15. */
const LAST_DATABASE = 15;

/**
 * One test file's view of the run's shared Redis server: a database number of its own, so files
 * running in parallel never meet. Whatever the application is given as `REDIS_URL` carries the
 * number, which `redisConnectionFrom` already understands, so no test needs special application
 * configuration. Tests of the adapters add a key prefix per test on top (`freshPrefix`).
 */
export interface TestRedis {
  readonly database: number;
  readonly connection: RedisOptions;
  getHost(): string;
  getPort(): number;
  /** `redis://host:port/database`. */
  getConnectionUrl(): string;
  /** Empties this file's database only. */
  flush(): Promise<void>;
  /** Open client connections on this file's database: ours, BullMQ's and the application's. */
  clientCount(): Promise<number>;
  /** Empties the database; the server itself belongs to the run and stays. */
  release(): Promise<void>;
}

/** Takes the next free database of the run's server; a run with more files than databases fails loudly. */
export async function freshRedis(): Promise<TestRedis> {
  const server = new URL(inject('redisUrl'));
  const host = server.hostname;
  const port = Number(server.port);
  const admin = new Redis({ host, port });
  const database = await admin.incr('test:last-database');
  if (database > LAST_DATABASE) {
    admin.disconnect();
    throw new Error(
      `Test file number ${database}: the shared Redis has only ${LAST_DATABASE} databases for files`,
    );
  }
  const onDatabase = async <T>(
    use: (client: Redis) => Promise<T>,
  ): Promise<T> => {
    const client = new Redis({ host, port, db: database });
    try {
      return await use(client);
    } finally {
      client.disconnect();
    }
  };
  const flush = () => onDatabase((client) => client.flushdb()).then(() => {});
  await flush();
  return {
    database,
    connection: { host, port, db: database },
    getHost: () => host,
    getPort: () => port,
    getConnectionUrl: () => `redis://${host}:${port}/${database}`,
    flush,
    clientCount: async () => {
      const list = String(await admin.call('CLIENT', 'LIST'));
      return list
        .split('\n')
        .filter((line) => line.split(' ').includes(`db=${database}`)).length;
    },
    release: async () => {
      await flush();
      admin.disconnect();
    },
  };
}

/** A Redis key prefix of its own, so that tests sharing a database never meet. */
export const freshPrefix = (): string => `test-${randomUUID()}`;
