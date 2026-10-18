import type { OnModuleDestroy } from '@nestjs/common';
import { MemoryChallengeStore } from '../contexts/identity/adapters/outbound/memory-challenge.store.js';
import { OutageLoggingChallengeStore } from '../contexts/identity/adapters/outbound/outage-logging-challenge.store.js';
import { RedisChallengeStore } from '../contexts/identity/adapters/outbound/redis-challenge.store.js';
import type { ChallengeStore } from '../contexts/identity/application/ports/challenge-store.js';
import {
  DEFAULT_REDIS_URL,
  redisConnectionFrom,
} from '../platform/queue/redis-connection.js';
import { createFailFastRedis } from '../platform/redis/fail-fast-redis.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { Logger } from '../shared-kernel/logger.js';

/** The environment variables that choose and configure the challenge store (SDD 9.1). */
export interface ChallengeStoreEnv {
  readonly CHALLENGE_STORE_DRIVER?: string | undefined;
  readonly REDIS_URL?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

export type ChallengeStoreDriver = 'memory' | 'redis';

/**
 * CHALLENGE_STORE_DRIVER: `memory` or `redis`. A challenge issued by one API instance must be
 * usable on another (SDD 9.1 runs at least two), so production refuses the in-memory store, also
 * when the variable is unset, like the development verifiers and demo data.
 */
export function challengeStoreDriverOf(
  env: ChallengeStoreEnv,
): ChallengeStoreDriver {
  const driver =
    env.CHALLENGE_STORE_DRIVER === undefined ||
    env.CHALLENGE_STORE_DRIVER === ''
      ? 'memory'
      : env.CHALLENGE_STORE_DRIVER;
  if (driver !== 'memory' && driver !== 'redis')
    throw new Error(`Unknown CHALLENGE_STORE_DRIVER "${driver}"`);
  if (driver === 'memory' && env.NODE_ENV === 'production')
    throw new Error(
      'CHALLENGE_STORE_DRIVER=memory is not allowed when NODE_ENV=production: ' +
        'a challenge issued by one API instance could not be used on another; ' +
        'set CHALLENGE_STORE_DRIVER=redis',
    );
  return driver;
}

/** A store that Nest closes at shutdown (the Redis connection). */
export type ManagedChallengeStore = ChallengeStore & Partial<OnModuleDestroy>;

export function createChallengeStore(
  env: ChallengeStoreEnv,
  deps: { readonly clock: Clock; readonly logger: Logger },
): ManagedChallengeStore {
  if (challengeStoreDriverOf(env) === 'memory')
    return new MemoryChallengeStore({ clock: deps.clock });
  const redis = new RedisChallengeStore({
    client: createFailFastRedis(
      redisConnectionFrom(
        env.REDIS_URL === undefined || env.REDIS_URL === ''
          ? DEFAULT_REDIS_URL
          : env.REDIS_URL,
      ),
    ),
    clock: deps.clock,
  });
  const watched = new OutageLoggingChallengeStore({
    inner: redis,
    logger: deps.logger,
  });
  return {
    save: (challenge) => watched.save(challenge),
    take: (nonce) => watched.take(nonce),
    onModuleDestroy: () => redis.close(),
  };
}
