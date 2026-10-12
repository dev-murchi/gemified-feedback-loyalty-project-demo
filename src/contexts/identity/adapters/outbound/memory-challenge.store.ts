import type { Clock } from '../../../../shared-kernel/clock.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { ChallengeStore } from '../../application/ports/challenge-store.js';
import { Challenge } from '../../domain/challenge/challenge.js';
import type { TooManyChallenges } from '../../domain/challenge/challenge-errors.js';
import type { Nonce } from '../../domain/challenge/nonce.js';

/** How many unused challenges the store keeps by default (60 s each, so about 170 per second). */
export const DEFAULT_MAX_LIVE_CHALLENGES = 10_000;

export interface MemoryChallengeStoreDeps {
  /** Used to forget expired challenges; the expiry rule itself is `Challenge.isLiveAt`. */
  readonly clock: Clock;
  /** The most challenges kept at once; DEFAULT_MAX_LIVE_CHALLENGES if omitted. */
  readonly maxLive?: number;
}

const copy = (challenge: Challenge): Challenge => ({
  ...challenge,
  expiresAt: new Date(challenge.expiresAt),
});

/**
 * Challenges in a Map of the single API process (enough for the demo, docs/08 S0-10). Taking is
 * atomic because JavaScript runs the lookup and the delete without interruption. The endpoint that
 * fills it needs no login, so the number of waiting challenges is capped: when the cap is reached,
 * expired ones are forgotten first, and only if it is still full is the new one refused.
 */
export class MemoryChallengeStore implements ChallengeStore {
  readonly #challenges = new Map<Nonce, Challenge>();
  readonly #maxLive: number;

  constructor(private readonly deps: MemoryChallengeStoreDeps) {
    this.#maxLive = deps.maxLive ?? DEFAULT_MAX_LIVE_CHALLENGES;
  }

  save(challenge: Challenge): Promise<Result<void, TooManyChallenges>> {
    if (this.#challenges.size >= this.#maxLive) this.#forgetExpired();
    if (this.#challenges.size >= this.#maxLive)
      return Promise.resolve(err(this.#full()));
    this.#challenges.set(challenge.nonce, copy(challenge));
    return Promise.resolve(ok(undefined));
  }

  take(nonce: Nonce): Promise<Challenge | undefined> {
    const challenge = this.#challenges.get(nonce);
    this.#challenges.delete(nonce);
    return Promise.resolve(challenge);
  }

  #forgetExpired(): void {
    const now = this.deps.clock.now();
    for (const [nonce, challenge] of this.#challenges) {
      if (!Challenge.isLiveAt(challenge, now)) this.#challenges.delete(nonce);
    }
  }

  /** The caller may try again when the earliest waiting challenge has expired. */
  #full(): TooManyChallenges {
    const now = this.deps.clock.now().getTime();
    const earliest = Math.min(
      ...[...this.#challenges.values()].map((c) => c.expiresAt.getTime()),
    );
    return {
      code: 'RATE_LIMITED',
      retryAfterSeconds: Math.max(1, Math.ceil((earliest - now) / 1000)),
    };
  }
}
