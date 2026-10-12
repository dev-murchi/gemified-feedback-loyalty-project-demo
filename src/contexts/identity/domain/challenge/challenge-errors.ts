import type { DomainError } from '../../../../shared-kernel/domain-error.js';

/**
 * Too many challenges are waiting to be used (the challenge endpoint needs no login, so it must
 * not let a script fill the store); API code RATE_LIMITED (429 with Retry-After).
 */
export interface TooManyChallenges extends DomainError<'RATE_LIMITED'> {
  /** When the oldest waiting challenge expires and room frees up; at least 1. */
  readonly retryAfterSeconds: number;
}
