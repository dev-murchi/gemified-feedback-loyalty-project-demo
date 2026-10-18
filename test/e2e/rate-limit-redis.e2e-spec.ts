// S0-10 slice 5 with RATE_LIMIT_DRIVER=redis on a real Redis (Testcontainers): two API instances
// started from the real application share their limits, which is why SDD 9.1 (at least two
// instances) needs Redis and not the in-memory limiter.

import request from 'supertest';
import { problemOf } from '../support/auth-client.js';
import { freshRedis, type TestRedis } from '../support/redis.js';
import { startApp, type RunningApp } from '../support/start-app.js';

describe('rate limits shared by two API instances (e2e, real Redis)', () => {
  let redis: TestRedis;
  const instances: RunningApp[] = [];

  beforeAll(async () => {
    redis = await freshRedis();
  });

  afterAll(() => redis.release());

  beforeEach(() => {
    vi.stubEnv('RATE_LIMIT_DRIVER', 'redis');
    vi.stubEnv('REDIS_URL', redis.getConnectionUrl());
    vi.stubEnv('RATE_LIMIT_IP_PER_MINUTE', '60');
    vi.stubEnv('RATE_LIMIT_IP_BURST', '2');
  });

  afterEach(async () => {
    await Promise.all(
      instances.splice(0).map((running) => running.app.close()),
    );
    vi.unstubAllEnvs();
  });

  const challenge = (running: RunningApp) =>
    request(running.app.getHttpServer()).post('/v1/auth/challenge');

  it('counts the calls of both instances against one IP budget', async () => {
    // Given two API instances on the same Redis
    const first = await startApp();
    const second = await startApp();
    instances.push(first, second);

    // When the same address calls the first instance twice and then the second
    const calls = [
      await challenge(first),
      await challenge(first),
      await challenge(second),
    ];

    // Then the second instance knows about the first one's calls
    expect(calls.map((call) => call.status)).toEqual([200, 200, 429]);
    expect(problemOf(calls[2] ?? { body: {} }).code).toBe('RATE_LIMITED');
    expect(calls[2]?.headers['retry-after']).toBe('1');
  });
});
