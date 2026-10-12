import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import { Nonce } from './nonce.js';

/** docs/06 §4: a challenge is valid for 60 seconds. */
export const CHALLENGE_TTL_MS = 60_000;

/**
 * A short-lived, single-use value (docs/06 §5.1). Not an aggregate: it has no identity of its own
 * besides the nonce, never changes and lives only in the ChallengeStore.
 */
export interface Challenge {
  readonly nonce: Nonce;
  readonly expiresAt: Date;
}

export const Challenge = {
  /** A new challenge with a fresh nonce, valid for CHALLENGE_TTL_MS from `now`. */
  issue(random: RandomSource, now: Date): Challenge {
    return {
      nonce: Nonce.generate(random),
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    };
  },

  /** SDD 7.1: accepted only before it expires; at `expiresAt` it is already expired. */
  isLiveAt(challenge: Challenge, now: Date): boolean {
    return now.getTime() < challenge.expiresAt.getTime();
  },
};
