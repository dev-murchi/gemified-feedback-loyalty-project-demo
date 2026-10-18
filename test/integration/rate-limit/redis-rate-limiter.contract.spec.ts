// The RateLimiter contract (ADR-016) against the Redis script on a real Redis (Testcontainers); the
// in-memory limiter runs the same cases in test/contract/platform.

import type { StartedRedisContainer } from '@testcontainers/redis';
import { RedisRateLimiter } from '../../../src/platform/rate-limit/redis-rate-limiter.js';
import { createFailFastRedis } from '../../../src/platform/redis/fail-fast-redis.js';
import { rateLimiterContract } from '../../contract/support/rate-limiter.contract.js';
import { FakeClock } from '../../support/fake-clock.js';
import { freshPrefix, startRedis } from '../../support/redis-container.js';

describe('RateLimiter (Redis)', () => {
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    redis = await startRedis();
  });

  afterAll(() => redis.stop());

  rateLimiterContract(() => {
    const clock = new FakeClock();
    const limiter = new RedisRateLimiter({
      client: createFailFastRedis({
        host: redis.getHost(),
        port: redis.getPort(),
      }),
      clock,
      prefix: freshPrefix(),
    });
    return Promise.resolve({ limiter, clock, dispose: () => limiter.close() });
  });
});
