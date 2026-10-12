import { CHALLENGE_STORE } from '../../src/composition/tokens.js';
import { MemoryChallengeStore } from '../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import { AuthClient, problemOf } from '../support/auth-client.js';
import { startApp, type RunningApp } from '../support/start-app.js';

describe('POST /v1/auth/challenge when too many are waiting (e2e)', () => {
  let running: RunningApp;
  let client: AuthClient;

  beforeEach(async () => {
    // Given an API whose store holds at most two waiting challenges
    running = await startApp((builder, { clock }) =>
      builder
        .overrideProvider(CHALLENGE_STORE)
        .useValue(new MemoryChallengeStore({ clock, maxLive: 2 })),
    );
    client = new AuthClient(running.app);
  });

  afterEach(() => running.app.close());

  it('answers 429 RATE_LIMITED with Retry-After instead of an error, then recovers', async () => {
    // When three challenges are asked for in a row
    const first = await client.http().post('/v1/auth/challenge');
    const second = await client.http().post('/v1/auth/challenge');
    const third = await client.http().post('/v1/auth/challenge');

    // Then the third is the contract's RATE_LIMITED, with the wait in the header and the body
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(third.status).toBe(429);
    expect(problemOf(third).code).toBe('RATE_LIMITED');
    expect(problemOf(third).retryAfterSeconds).toBe(60);
    expect(third.headers['retry-after']).toBe('60');
    expect(third.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );

    // And once the waiting challenges have expired, a new one is issued
    running.clock.advance(60_000);
    const later = await client.http().post('/v1/auth/challenge');
    expect(later.status).toBe(200);
  });

  it('does not reach registration or session: they only take challenges', async () => {
    // Given a full store
    await client.http().post('/v1/auth/challenge');
    await client.http().post('/v1/auth/challenge');

    // When a challenge that was never issued is used
    const response = await client
      .http()
      .post('/v1/auth/session')
      .send({
        platform: 'android',
        keyId: 'Yz7kQ2mF9xR4tW1vB6nH3jL8pD5sA0gE2cU7iO4yT1q',
        nonce: 'A'.repeat(43),
        signature: 'AAAA',
      });

    // Then it is the usual CHALLENGE_INVALID, not a rate limit
    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('CHALLENGE_INVALID');
  });
});
