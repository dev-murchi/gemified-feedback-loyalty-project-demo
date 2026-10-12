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

  it('issues a challenge valid for 60 seconds and keeps it for a single use (FR-AUTH-03)', async () => {
    // When a challenge is created
    const challenge = await createChallenge.execute();

    // Then it expires a minute from now and the store gives it back once
    expect(challenge.expiresAt).toEqual(new Date('2026-10-12T09:16:30.000Z'));
    expect(await challenges.take(challenge.nonce)).toEqual(challenge);
    expect(await challenges.take(challenge.nonce)).toBeUndefined();
  });

  it('issues a different nonce every time', async () => {
    // When two challenges are created
    const first = await createChallenge.execute();
    const second = await createChallenge.execute();

    // Then their nonces differ
    expect(second.nonce).not.toBe(first.nonce);
  });
});
