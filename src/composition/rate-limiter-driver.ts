import type { OnModuleDestroy } from '@nestjs/common';
import { FailOpenRateLimiter } from '../platform/rate-limit/fail-open-rate-limiter.js';
import { MemoryRateLimiter } from '../platform/rate-limit/memory-rate-limiter.js';
import type { RateLimiter } from '../platform/rate-limit/rate-limiter.js';
import {
  RedisRateLimiter,
  createRateLimitRedis,
} from '../platform/rate-limit/redis-rate-limiter.js';
import { redisConnectionFrom } from '../platform/queue/redis-connection.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { RateLimitConfig } from './rate-limit-config.js';

/** A limiter that Nest closes at shutdown (the Redis connection). */
export type ManagedRateLimiter = RateLimiter & Partial<OnModuleDestroy>;

/**
 * RATE_LIMIT_DRIVER: `memory` (the default: tests and the single-process demo) or `redis` (shared by
 * every API instance, SDD 9.1). The Redis limiter fails open: if Redis is down, requests go through.
 */
export function createRateLimiter(
  config: RateLimitConfig,
  deps: { readonly clock: Clock; readonly logger: Logger },
): ManagedRateLimiter {
  if (config.driver === 'memory')
    return new MemoryRateLimiter({ clock: deps.clock });
  const redis = new RedisRateLimiter({
    client: createRateLimitRedis(redisConnectionFrom(config.redisUrl)),
    clock: deps.clock,
  });
  const guarded = new FailOpenRateLimiter({
    inner: redis,
    logger: deps.logger,
  });
  return {
    check: (key, policy) => guarded.check(key, policy),
    onModuleDestroy: () => redis.close(),
  };
}
