import type { Result } from '../../../../shared-kernel/result.js';
import type { Challenge } from '../../domain/challenge/challenge.js';
import type { TooManyChallenges } from '../../domain/challenge/challenge-errors.js';
import type { Nonce } from '../../domain/challenge/nonce.js';

/**
 * Keeps issued challenges until they are used (docs/06 §5.1). In memory for the demo, Redis later
 * (S0-10, Should).
 *
 * Not part of the unit of work: a nonce that was taken stays used even if the unit of work that
 * took it rolls back, so a failed registration cannot be replayed with the same nonce (T-S4).
 */
export interface ChallengeStore {
  /**
   * Keeps the challenge until it is taken; it may be forgotten once it has expired. The store
   * holds a limited number of waiting challenges: when it is full of live ones it refuses with
   * TooManyChallenges, so an unauthenticated caller cannot grow it without limit.
   */
  save(challenge: Challenge): Promise<Result<void, TooManyChallenges>>;
  /**
   * Removes and returns the challenge in one atomic step (Redis GETDEL), so two requests can never
   * both get it. Undefined if the nonce is unknown or already taken. Does not check the expiry:
   * the caller decides with `Challenge.isLiveAt`.
   */
  take(nonce: Nonce): Promise<Challenge | undefined>;
}
