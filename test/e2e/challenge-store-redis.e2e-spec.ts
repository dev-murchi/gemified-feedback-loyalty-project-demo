// S0-10 slice 6 with CHALLENGE_STORE_DRIVER=redis: two API instances share their challenges (SDD
// 9.1 runs at least two), and a Redis that is down is a 500, never a challenge nobody can verify.
// Every response is also checked against the contract.

import type { StartedRedisContainer } from '@testcontainers/redis';
import { AuthClient, problemOf } from '../support/auth-client.js';
import { FakeDevice } from '../support/fake-device.js';
import { startRedis } from '../support/redis-container.js';
import { startApp, type RunningApp } from '../support/start-app.js';

describe('challenges shared by two API instances (e2e, real Redis)', () => {
  let redis: StartedRedisContainer;
  const instances: RunningApp[] = [];

  beforeAll(async () => {
    redis = await startRedis();
  });

  afterAll(() => redis.stop());

  beforeEach(() => {
    vi.stubEnv('CHALLENGE_STORE_DRIVER', 'redis');
    vi.stubEnv('REDIS_URL', redis.getConnectionUrl());
  });

  afterEach(async () => {
    await Promise.all(
      instances.splice(0).map((running) => running.app.close()),
    );
    vi.unstubAllEnvs();
  });

  const instance = async (): Promise<AuthClient> => {
    const running = await startApp();
    instances.push(running);
    return new AuthClient(running.app);
  };

  it('registers a device on one instance with a challenge issued by another, once only', async () => {
    // Given a challenge issued by instance A, and a device that signs it
    const a = await instance();
    const b = await instance();
    const device = new FakeDevice();
    const nonce = await a.nonce();
    const body = { nonce, ...device.androidEvidence(nonce) };

    // When the registration arrives at instance B
    const onB = await b.http().post('/v1/auth/register').send(body);

    // Then B accepts it
    expect(onB.status).toBe(201);

    // And the same request cannot be replayed, on either instance
    const replayOnB = await b.http().post('/v1/auth/register').send(body);
    const replayOnA = await a.http().post('/v1/auth/register').send(body);
    expect(problemOf(replayOnB).code).toBe('CHALLENGE_INVALID');
    expect(problemOf(replayOnA).code).toBe('CHALLENGE_INVALID');
  });
});

describe('a challenge store whose Redis is down (e2e)', () => {
  let running: RunningApp;
  let client: AuthClient;

  beforeEach(async () => {
    // Nothing listens on port 1
    vi.stubEnv('CHALLENGE_STORE_DRIVER', 'redis');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');
    running = await startApp();
    client = new AuthClient(running.app);
  });

  afterEach(async () => {
    await running.app.close();
    vi.unstubAllEnvs();
  });

  it('answers the challenge endpoint with 500 INTERNAL_ERROR and issues nothing', async () => {
    // When challenges are asked for while Redis is down
    const responses = [];
    for (let i = 0; i < 4; i += 1)
      responses.push(await client.http().post('/v1/auth/challenge'));

    // Then each answer is the contract's INTERNAL_ERROR, without a nonce and without internals
    for (const response of responses) {
      expect(response.status).toBe(500);
      expect(problemOf(response).code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(response.body)).not.toMatch(
        /nonce|redis|127\.0\.0\.1/i,
      );
    }
  });

  it('logs the outage of the store once, however many requests fail', async () => {
    for (let i = 0; i < 6; i += 1)
      await client.http().post('/v1/auth/challenge');

    const outage = running.logger.warnings.filter((warning) =>
      warning.message.startsWith('Challenge store unavailable'),
    );
    expect(outage).toHaveLength(1);
  });

  it('does not let a registration through on a nonce it cannot check', async () => {
    const device = new FakeDevice();
    const nonce = 'A'.repeat(43);

    const response = await client
      .http()
      .post('/v1/auth/register')
      .send({ nonce, ...device.androidEvidence(nonce) });

    expect(response.status).toBe(500);
    expect(problemOf(response).code).toBe('INTERNAL_ERROR');
  });
});
