import type { RedisOptions } from 'bullmq';

export const DEFAULT_REDIS_URL = 'redis://localhost:6379';

const decoded = (value: string): string | undefined =>
  value === '' ? undefined : decodeURIComponent(value);

/** BullMQ connection options from a `redis://[user:password@]host[:port][/db]` URL (`rediss://` for TLS). */
export function redisConnectionFrom(url: string): RedisOptions {
  const parsed = new URL(url);
  const username = decoded(parsed.username);
  const password = decoded(parsed.password);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? 6379 : Number(parsed.port),
    db,
    ...(username === undefined ? {} : { username }),
    ...(password === undefined ? {} : { password }),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/** The options a plain client needs: where Redis is and how to sign in. */
export const plainClientOptions = (connection: RedisOptions) => ({
  host: connection.host ?? 'localhost',
  port: connection.port ?? 6379,
  db: connection.db ?? 0,
  ...(connection.username === undefined
    ? {}
    : { username: connection.username }),
  ...(connection.password === undefined
    ? {}
    : { password: connection.password }),
  ...(connection.tls === undefined ? {} : { tls: connection.tls as object }),
});
