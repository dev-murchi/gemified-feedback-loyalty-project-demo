// The RateLimiter contract (ADR-016) against the Redis script on a real Redis (Testcontainers); the
// in-memory limiter runs the same cases in test/contract/platform.

import { RedisRateLimiter } from '../../../src/platform/rate-limit/redis-rate-limiter.js';
import { createFailFastRedis } from '../../../src/platform/redis/fail-fast-redis.js';
import { rateLimiterContract } from '../../contract/support/rate-limiter.contract.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  freshPrefix,
  freshRedis,
  type TestRedis,
} from '../../support/redis.js';

describe('RateLimiter (Redis)', () => {
  let redis: TestRedis;

  beforeAll(async () => {
    redis = await freshRedis();
  });

  afterAll(() => redis.release());

  rateLimiterContract(() => {
    const clock = new FakeClock();
    const limiter = new RedisRateLimiter({
      client: createFailFastRedis(redis.connection),
      clock,
      prefix: freshPrefix(),
    });
    return Promise.resolve({ limiter, clock, dispose: () => limiter.close() });
  });
});
