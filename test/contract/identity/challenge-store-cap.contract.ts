// The cap on waiting challenges (it bounds the memory the unauthenticated challenge endpoint can
// use, not the request rate): the same cases run against the in-memory store and against Redis.

import { Challenge } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import type {
  ChallengeStoreHarness,
  ChallengeStoreOptions,
} from '../../support/memory-identity.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

export function challengeStoreCapContract(
  makeHarness: (
    options?: ChallengeStoreOptions,
  ) => Promise<ChallengeStoreHarness>,
): void {
  describe('cap on waiting challenges', () => {
    const random = new SequentialRandomSource();
    let harness: ChallengeStoreHarness;
    const issue = () => Challenge.issue(random, harness.clock.now());

    const open = async (maxLive: number): Promise<void> => {
      harness = await makeHarness({ maxLive });
    };

    afterEach(() => harness.dispose());

    it('refuses the challenge beyond the cap and keeps the ones it has', async () => {
      // Given a full store
      await open(3);
      const kept = [issue(), issue(), issue()];
      for (const challenge of kept) await harness.store.save(challenge);

      // When another challenge is saved
      const refused = await harness.store.save(issue());

      // Then it is refused, and the three are still there
      expect(refused.ok).toBe(false);
      for (const challenge of kept)
        expect(await harness.store.take(challenge.nonce)).toEqual(challenge);
    });

    it('tells the caller to wait until the earliest waiting challenge expires', async () => {
      // Given a full store whose first challenge is 10 seconds old
      await open(3);
      await harness.store.save(issue());
      harness.clock.advance(10_000);
      await harness.store.save(issue());
      await harness.store.save(issue());

      // When another is refused
      const refused = await harness.store.save(issue());

      // Then the wait is the 50 seconds the first one has left
      expect(refused).toEqual({
        ok: false,
        error: { code: 'RATE_LIMITED', retryAfterSeconds: 50 },
      });
    });

    it('frees the room of expired challenges before refusing', async () => {
      // Given a full store whose challenges have all expired
      await open(3);
      const expired = [issue(), issue(), issue()];
      for (const challenge of expired) await harness.store.save(challenge);
      harness.clock.advance(60_000);

      // When another challenge is saved
      const fresh = issue();
      const saved = await harness.store.save(fresh);

      // Then it is accepted, the expired ones never become live, and the new one is there
      expect(saved.ok).toBe(true);
      for (const challenge of expired) {
        const taken = await harness.store.take(challenge.nonce);
        const live =
          taken !== undefined && Challenge.isLiveAt(taken, harness.clock.now());
        expect(live).toBe(false);
      }
      expect(await harness.store.take(fresh.nonce)).toEqual(fresh);
    });

    it('frees the room of a challenge that was used', async () => {
      // Given a full store
      await open(3);
      const first = issue();
      await harness.store.save(first);
      await harness.store.save(issue());
      await harness.store.save(issue());

      // When one is taken and another saved
      await harness.store.take(first.nonce);
      const saved = await harness.store.save(issue());

      // Then there is room again
      expect(saved.ok).toBe(true);
    });

    it('allows 10 000 waiting challenges by default and refuses the next one', async () => {
      // Given a store with the default cap
      harness = await makeHarness();
      for (let i = 0; i < 10_000; i += 1)
        expect((await harness.store.save(issue())).ok).toBe(true);

      // When one more arrives
      const refused = await harness.store.save(issue());

      // Then it is refused
      expect(refused.ok).toBe(false);
    });
  });
}
