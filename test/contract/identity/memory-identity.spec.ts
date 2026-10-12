// Runs the Identity contracts against the in-memory adapters. S0-11 adds the user repository with a
// PostgreSQL harness under test/integration/; S0-10 (Should) the challenge store with Redis.

import { MemoryChallengeStore } from '../../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import { Challenge } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  memoryChallengeStoreHarness,
  memoryIdentityHarness,
} from '../../support/memory-identity.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';
import { challengeStoreContract } from './challenge-store.contract.js';
import { userRepositoryContract } from './user-repository.contract.js';

describe('UserRepository (in-memory)', () => {
  userRepositoryContract(memoryIdentityHarness);
});

describe('ChallengeStore (in-memory)', () => {
  challengeStoreContract(memoryChallengeStoreHarness);

  describe('cap on waiting challenges', () => {
    const random = new SequentialRandomSource();
    const clock = new FakeClock();
    let store: MemoryChallengeStore;
    const issue = () => Challenge.issue(random, clock.now());

    beforeEach(() => {
      clock.set(new Date('2026-10-13T09:00:00.000Z'));
      store = new MemoryChallengeStore({ clock, maxLive: 3 });
    });

    it('refuses the challenge beyond the cap and keeps the ones it has', async () => {
      // Given a full store
      const kept = [issue(), issue(), issue()];
      for (const challenge of kept) await store.save(challenge);

      // When another challenge is saved
      const refused = await store.save(issue());

      // Then it is refused, and the three are still there
      expect(refused.ok).toBe(false);
      for (const challenge of kept)
        expect(await store.take(challenge.nonce)).toEqual(challenge);
    });

    it('tells the caller to wait until the earliest waiting challenge expires', async () => {
      // Given a full store whose first challenge is 10 seconds old
      await store.save(issue());
      clock.advance(10_000);
      await store.save(issue());
      await store.save(issue());

      // When another is refused
      const refused = await store.save(issue());

      // Then the wait is the 50 seconds the first one has left
      expect(refused).toEqual({
        ok: false,
        error: { code: 'RATE_LIMITED', retryAfterSeconds: 50 },
      });
    });

    it('frees the room of expired challenges before refusing', async () => {
      // Given a full store whose challenges have all expired
      const expired = [issue(), issue(), issue()];
      for (const challenge of expired) await store.save(challenge);
      clock.advance(60_000);

      // When another challenge is saved
      const fresh = issue();
      const saved = await store.save(fresh);

      // Then it is accepted, and the expired ones are gone
      expect(saved.ok).toBe(true);
      for (const challenge of expired)
        expect(await store.take(challenge.nonce)).toBeUndefined();
      expect(await store.take(fresh.nonce)).toEqual(fresh);
    });

    it('frees the room of a challenge that was used', async () => {
      // Given a full store
      const first = issue();
      await store.save(first);
      await store.save(issue());
      await store.save(issue());

      // When one is taken and another saved
      await store.take(first.nonce);
      const saved = await store.save(issue());

      // Then there is room again
      expect(saved.ok).toBe(true);
    });

    it('allows 10 000 waiting challenges by default and refuses the next one', async () => {
      // Given a store with the default cap
      const defaults = new MemoryChallengeStore({ clock });
      for (let i = 0; i < 10_000; i += 1)
        expect((await defaults.save(issue())).ok).toBe(true);

      // When one more arrives
      const refused = await defaults.save(issue());

      // Then it is refused
      expect(refused.ok).toBe(false);
    });
  });
});
