import type { RedisOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { plainClientOptions } from '../queue/redis-connection.js';

/** How long one Redis command may take before the request goes on without it. */
export const COMMAND_TIMEOUT_MS = 250;

/**
 * A client for request-time Redis use: commands fail at once while Redis is down (no offline
 * queue) or slow (a timeout), because a request must not hang on Redis. The client reconnects by
 * itself. It connects on first use (`lazyConnect`), so building the application opens no
 * connection, and a start-up that fails for another reason leaves nothing behind.
 */
export function createFailFastRedis(connection: RedisOptions): Redis {
  const client = new Redis({
    ...plainClientOptions(connection),
    enableOfflineQueue: false,
    lazyConnect: true,
    commandTimeout: COMMAND_TIMEOUT_MS,
  });
  // Failures are seen by the command that hits them; this only prevents unhandled error events.
  client.on('error', () => undefined);
  return client;
}

/**
 * Before the first command the client has not connected yet ("wait"), and while it is connecting
 * (right after that, or a reconnect in progress) a command would fail only because it was too
 * early. So connect if needed and wait for the connection, but never longer than a command may
 * take. When Redis is down ("reconnecting") there is nothing to wait for.
 */
export function connectionSettled(client: Redis): Promise<void> {
  if (client.status === 'wait') client.connect().catch(() => undefined);
  if (!['wait', 'connecting', 'connect'].includes(client.status))
    return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      client.off('ready', done);
      client.off('close', done);
      resolve();
    };
    const timer = setTimeout(done, COMMAND_TIMEOUT_MS);
    client.on('ready', done);
    client.on('close', done);
  });
}

/** Closes the connection politely when it is up, and drops it when it is not. */
export async function closeRedis(client: Redis): Promise<void> {
  if (client.status !== 'ready') {
    client.disconnect();
    return;
  }
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
