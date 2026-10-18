import type { RedisOptions } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from '../../shared-kernel/logger.js';
import { plainClientOptions } from './redis-connection.js';

export interface RedisMonitorDeps {
  readonly connection: RedisOptions;
  readonly logger: Logger;
}

/** Host and port only: never the password, the user or the full URL. */
export const endpointOf = (
  connection: RedisOptions,
): { readonly redisHost: string; readonly redisPort: number } => ({
  redisHost: connection.host ?? 'localhost',
  redisPort: connection.port ?? 6379,
});

/**
 * Tells the log when Redis is reachable and when it is not. BullMQ opens several connections of its
 * own, so one extra connection watches the state, and each change is logged once: "Redis
 * connected" when it comes up, "Redis connection lost" (warn) when a connected client drops. The
 * client reconnects by itself; our own close at shutdown is not a loss.
 */
export class RedisMonitor {
  #client: Redis | undefined;
  #connected = false;
  #closing = false;

  constructor(private readonly deps: RedisMonitorDeps) {}

  start(): void {
    if (this.#client !== undefined) return;
    const client = new Redis(plainClientOptions(this.deps.connection));
    client.on('ready', () => this.#up());
    client.on('close', () => this.#down());
    // Failures to connect are reported by BullMQ's own error events; this only keeps them from
    // becoming unhandled errors.
    client.on('error', () => undefined);
    this.#client = client;
  }

  async stop(): Promise<void> {
    this.#closing = true;
    const client = this.#client;
    this.#client = undefined;
    if (client === undefined) return;
    if (client.status !== 'ready') {
      // Down or still connecting: quit() would wait in the offline queue for a server that is gone.
      client.disconnect();
      return;
    }
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  #up(): void {
    if (this.#connected || this.#closing) return;
    this.#connected = true;
    this.deps.logger.info('Redis connected', endpointOf(this.deps.connection));
  }

  #down(): void {
    if (!this.#connected || this.#closing) return;
    this.#connected = false;
    this.deps.logger.warn(
      'Redis connection lost',
      endpointOf(this.deps.connection),
    );
  }
}
