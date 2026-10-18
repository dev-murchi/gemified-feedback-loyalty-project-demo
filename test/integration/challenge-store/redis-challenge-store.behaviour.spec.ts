// What only Redis adds to the ChallengeStore contract (SDD 9.1): a challenge issued through one API
// instance is consumed through another, Redis forgets it when it expires, and a Redis that is down
// is an error, not a free pass.

import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { OutageLoggingChallengeStore } from '../../../src/contexts/identity/adapters/outbound/outage-logging-challenge.store.js';
import { RedisChallengeStore } from '../../../src/contexts/identity/adapters/outbound/redis-challenge.store.js';
import { Challenge } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import { takeLiveNonce } from '../../../src/contexts/identity/application/take-live-nonce.js';
import { CreateChallenge } from '../../../src/contexts/identity/application/use-cases/create-challenge.js';
import { createFailFastRedis } from '../../../src/platform/redis/fail-fast-redis.js';
import { FakeClock } from '../../support/fake-clock.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { redisChallengeStore } from '../../support/redis-challenge-store.js';
import { freshRedis, type TestRedis } from '../../support/redis.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';
import { waitFor } from '../../support/wait-for.js';

describe('RedisChallengeStore', () => {
  let redis: TestRedis;
  let raw: Redis;
  const opened: RedisChallengeStore[] = [];

  beforeAll(async () => {
    redis = await freshRedis();
    raw = new Redis(redis.connection);
  });

  afterAll(async () => {
    raw.disconnect();
    await redis.release();
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((store) => store.close()));
  });

  /** Two API instances: own connections, the same clock, the same Redis and key prefix. */
  const twoInstances = () => {
    const clock = new FakeClock();
    const prefix = `test-${randomUUID()}:`;
    const instance = () => {
      const store = redisChallengeStore(redis, { clock, prefix });
      opened.push(store);
      return store;
    };
    return { clock, prefix, a: instance(), b: instance() };
  };

  it('consumes through another instance a challenge issued through one (SDD 9.1)', async () => {
    // Given a challenge issued by the use case of instance A
    const { clock, a, b } = twoInstances();
    const issued = await new CreateChallenge({
      challenges: a,
      random: new SequentialRandomSource(),
      clock,
    }).execute();
    if (!issued.ok) throw new Error('the challenge was not issued');

    // When instance B uses it, and then either instance tries again
    const onB = await takeLiveNonce(
      { challenges: b, clock },
      issued.value.nonce,
    );
    const againOnB = await takeLiveNonce(
      { challenges: b, clock },
      issued.value.nonce,
    );
    const againOnA = await takeLiveNonce(
      { challenges: a, clock },
      issued.value.nonce,
    );

    // Then B accepts it once, and nobody accepts it a second time
    expect(onB.ok).toBe(true);
    expect(againOnB).toEqual({
      ok: false,
      error: { code: 'CHALLENGE_INVALID' },
    });
    expect(againOnA).toEqual({
      ok: false,
      error: { code: 'CHALLENGE_INVALID' },
    });
  });

  it('refuses a challenge that expired, whichever instance is asked', async () => {
    // Given a challenge issued through A
    const { clock, a, b } = twoInstances();
    const issued = await new CreateChallenge({
      challenges: a,
      random: new SequentialRandomSource(),
      clock,
    }).execute();
    if (!issued.ok) throw new Error('the challenge was not issued');

    // When 60 seconds pass and B is asked
    clock.advance(60_000);
    const used = await takeLiveNonce(
      { challenges: b, clock },
      issued.value.nonce,
    );

    // Then it is CHALLENGE_INVALID
    expect(used).toEqual({ ok: false, error: { code: 'CHALLENGE_INVALID' } });
  });

  it('counts the cap across instances: together they keep at most `maxLive` challenges', async () => {
    // Given two instances with a cap of 3
    const clock = new FakeClock();
    const prefix = `test-${randomUUID()}:`;
    const a = redisChallengeStore(redis, { clock, prefix, maxLive: 3 });
    const b = redisChallengeStore(redis, { clock, prefix, maxLive: 3 });
    opened.push(a, b);
    const random = new SequentialRandomSource();
    const issue = () => Challenge.issue(random, clock.now());

    // When A saves two and B saves one
    const saved = [
      await a.save(issue()),
      await a.save(issue()),
      await b.save(issue()),
    ];

    // Then both are refused a fourth, although neither holds more than two on its own
    expect(saved.every((result) => result.ok)).toBe(true);
    expect((await a.save(issue())).ok).toBe(false);
    expect((await b.save(issue())).ok).toBe(false);
  });

  it('gives each challenge a Redis expiry of its lifetime, so Redis forgets it', async () => {
    const { clock, prefix, a } = twoInstances();
    const challenge = Challenge.issue(
      new SequentialRandomSource(),
      clock.now(),
    );
    await a.save(challenge);

    const remaining = await raw.pttl(`${prefix}challenge:${challenge.nonce}`);

    expect(remaining).toBeGreaterThan(59_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it('really forgets a challenge when its time is up', async () => {
    // Given a challenge with 200 ms left
    const { clock, prefix, a } = twoInstances();
    const challenge = {
      ...Challenge.issue(new SequentialRandomSource(), clock.now()),
      expiresAt: new Date(clock.now().getTime() + 200),
    };
    await a.save(challenge);
    const key = `${prefix}challenge:${challenge.nonce}`;
    expect(await raw.exists(key)).toBe(1);

    // When Redis's own timer runs out
    // Then the key is gone without anyone taking it
    await waitFor(
      async () => (await raw.exists(key)) === 0,
      'the key to expire',
    );
  });

  it('is an error, not a free pass, when Redis cannot be reached; the outage is logged once', async () => {
    // Given a store whose Redis does not answer (nothing listens on port 1)
    const logger = new RecordingLogger();
    const unreachable = new RedisChallengeStore({
      client: createFailFastRedis({ host: '127.0.0.1', port: 1 }),
      clock: new FakeClock(),
    });
    opened.push(unreachable);
    const store = new OutageLoggingChallengeStore({
      inner: unreachable,
      logger,
    });
    const create = new CreateChallenge({
      challenges: store,
      random: new SequentialRandomSource(),
      clock: new FakeClock(),
    });

    // When challenges are asked for again and again, and one is used
    const failures = [];
    for (let i = 0; i < 5; i += 1)
      failures.push(
        await create.execute().then(
          () => 'issued',
          () => 'failed',
        ),
      );
    const used = await takeLiveNonce(
      { challenges: store, clock: new FakeClock() },
      'z'.repeat(43),
    ).then(
      () => 'answered',
      () => 'failed',
    );

    // Then no challenge was issued and none could be used, and the log has one warning
    expect(failures).toEqual(Array(5).fill('failed'));
    expect(used).toBe('failed');
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.message).toBe(
      'Challenge store unavailable; challenges cannot be issued or used',
    );
  });
});
