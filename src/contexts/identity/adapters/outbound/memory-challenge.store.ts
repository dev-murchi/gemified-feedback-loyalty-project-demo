import type { Clock } from '../../../../shared-kernel/clock.js';
import type { ChallengeStore } from '../../application/ports/challenge-store.js';
import { Challenge } from '../../domain/challenge/challenge.js';
import type { Nonce } from '../../domain/challenge/nonce.js';

export interface MemoryChallengeStoreDeps {
  /** Used only to forget expired challenges; the expiry rule itself is `Challenge.isLiveAt`. */
  readonly clock: Clock;
}

const copy = (challenge: Challenge): Challenge => ({
  ...challenge,
  expiresAt: new Date(challenge.expiresAt),
});

/**
 * Challenges in a Map of the single API process (enough for the demo, docs/08 S0-10). Taking is
 * atomic because JavaScript runs the lookup and the delete without interruption.
 */
export class MemoryChallengeStore implements ChallengeStore {
  readonly #challenges = new Map<Nonce, Challenge>();

  constructor(private readonly deps: MemoryChallengeStoreDeps) {}

  save(challenge: Challenge): Promise<void> {
    this.#forgetExpired();
    this.#challenges.set(challenge.nonce, copy(challenge));
    return Promise.resolve();
  }

  take(nonce: Nonce): Promise<Challenge | undefined> {
    const challenge = this.#challenges.get(nonce);
    this.#challenges.delete(nonce);
    return Promise.resolve(challenge);
  }

  /** Like a Redis TTL: unused challenges do not pile up. */
  #forgetExpired(): void {
    const now = this.deps.clock.now();
    for (const [nonce, challenge] of this.#challenges) {
      if (!Challenge.isLiveAt(challenge, now)) this.#challenges.delete(nonce);
    }
  }
}
