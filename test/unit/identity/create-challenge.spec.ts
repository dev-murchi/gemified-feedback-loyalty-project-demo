import { MemoryChallengeStore } from '../../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import { CreateChallenge } from '../../../src/contexts/identity/application/use-cases/create-challenge.js';
import { FakeClock } from '../../support/fake-clock.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

describe('CreateChallenge', () => {
  const clock = new FakeClock(new Date('2026-10-12T09:15:30.000Z'));
  let challenges: MemoryChallengeStore;
  let createChallenge: CreateChallenge;

  beforeEach(() => {
    challenges = new MemoryChallengeStore({ clock });
    createChallenge = new CreateChallenge({
      challenges,
      random: new SequentialRandomSource(),
      clock,
    });
  });

  const created = async () => {
    const result = await createChallenge.execute();
    if (!result.ok) throw new Error('challenge was refused');
    return result.value;
  };

  it('issues a challenge valid for 60 seconds and keeps it for a single use (FR-AUTH-03)', async () => {
    // When a challenge is created
    const challenge = await created();

    // Then it expires a minute from now and the store gives it back once
    expect(challenge.expiresAt).toEqual(new Date('2026-10-12T09:16:30.000Z'));
    expect(await challenges.take(challenge.nonce)).toEqual(challenge);
    expect(await challenges.take(challenge.nonce)).toBeUndefined();
  });

  it('issues a different nonce every time', async () => {
    // When two challenges are created
    const first = await created();
    const second = await created();

    // Then their nonces differ
    expect(second.nonce).not.toBe(first.nonce);
  });

  it('answers RATE_LIMITED with the time to wait when the store is full', async () => {
    // Given a store that holds two challenges
    const small = new MemoryChallengeStore({ clock, maxLive: 2 });
    const limited = new CreateChallenge({
      challenges: small,
      random: new SequentialRandomSource(),
      clock,
    });
    await limited.execute();
    await limited.execute();

    // When a third is asked for
    const refused = await limited.execute();

    // Then it is refused until the oldest one expires (60 seconds)
    expect(refused).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: 60 },
    });
  });
});
