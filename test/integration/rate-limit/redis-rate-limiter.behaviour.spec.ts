// What only Redis adds to the RateLimiter contract: the state is shared between API instances, it
// expires when the caller is idle, and a Redis that is down does not stop requests (fail open).

import type { StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { FailOpenRateLimiter } from '../../../src/platform/rate-limit/fail-open-rate-limiter.js';
import { RedisRateLimiter } from '../../../src/platform/rate-limit/redis-rate-limiter.js';
import { createFailFastRedis } from '../../../src/platform/redis/fail-fast-redis.js';
import { FakeClock } from '../../support/fake-clock.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { freshPrefix, startRedis } from '../../support/redis-container.js';

const POLICY = { perMinute: 6, burst: 3 };

describe('RedisRateLimiter', () => {
  let redis: StartedRedisContainer;
  let raw: Redis;
  const opened: RedisRateLimiter[] = [];

  beforeAll(async () => {
    redis = await startRedis();
    raw = new Redis({ host: redis.getHost(), port: redis.getPort() });
  });

  afterAll(async () => {
    raw.disconnect();
    await redis.stop();
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((limiter) => limiter.close()));
  });

  /** One API instance: its own connection, the shared clock and key prefix. */
  const instance = (clock: FakeClock, prefix: string): RedisRateLimiter => {
    const limiter = new RedisRateLimiter({
      client: createFailFastRedis({
        host: redis.getHost(),
        port: redis.getPort(),
      }),
      clock,
      prefix,
    });
    opened.push(limiter);
    return limiter;
  };

  it('is shared by two API instances: together they get one burst, not two', async () => {
    // Given two instances using the same Redis
    const clock = new FakeClock();
    const prefix = freshPrefix();
    const first = instance(clock, prefix);
    const second = instance(clock, prefix);

    // When the first uses two of the three, and the second asks twice
    await first.check('rl:device:d1', POLICY);
    await first.check('rl:device:d1', POLICY);
    const third = await second.check('rl:device:d1', POLICY);
    const fourth = await second.check('rl:device:d1', POLICY);

    // Then the second instance sees the first one's requests
    expect(third.allowed).toBe(true);
    expect(fourth).toEqual({ allowed: false, retryAfterSeconds: 10 });
  });

  it('keeps one prefixed key per caller and lets it expire when the caller would be idle', async () => {
    // Given three requests at a known time
    const clock = new FakeClock();
    const prefix = freshPrefix();
    const limiter = instance(clock, prefix);
    for (let i = 0; i < 3; i += 1) await limiter.check('rl:device:d1', POLICY);

    // Then there is one key, under the prefix, that lives while the bucket is not empty again
    expect(await raw.keys(`${prefix}*`)).toEqual([`${prefix}rl:device:d1`]);
    const remaining = await raw.pttl(`${prefix}rl:device:d1`);
    expect(remaining).toBeGreaterThan(29_000);
    expect(remaining).toBeLessThanOrEqual(30_000);
  });

  it('lets requests through when Redis cannot be reached, and logs the outage once', async () => {
    // Given a limiter whose Redis does not answer (nothing listens on port 1)
    const logger = new RecordingLogger();
    const unreachable = new RedisRateLimiter({
      client: createFailFastRedis({ host: '127.0.0.1', port: 1 }),
      clock: new FakeClock(),
    });
    opened.push(unreachable);
    const limiter = new FailOpenRateLimiter({ inner: unreachable, logger });

    // When more requests than the burst arrive
    const decisions = [];
    for (let i = 0; i < 6; i += 1)
      decisions.push(await limiter.check('rl:device:d1', POLICY));

    // Then every one is allowed, and exactly one warning was logged
    expect(decisions.every((decision) => decision.allowed)).toBe(true);
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.message).toBe(
      'Rate limiter unavailable; allowing requests',
    );
    expect(JSON.stringify(logger.warnings)).not.toContain('rl:device');
  });
});
