import type { DomainError } from '../../../../shared-kernel/domain-error.js';

/** A feedback to this branch is still being analyzed (FR-QR-07); API code FEEDBACK_PENDING (409). */
export type FeedbackPending = DomainError<'FEEDBACK_PENDING'>;

/** The last rewarded feedback is less than 24 hours old (FR-QR-07); API code REWARD_COOLDOWN (422). */
export interface RewardCooldownActive extends DomainError<'REWARD_COOLDOWN'> {
  readonly retryAfterSeconds: number;
}

/** The attempt limit of the last 24 hours is used up (FR-QR-09); API code ATTEMPTS_EXHAUSTED (422). */
export interface AttemptsExhausted extends DomainError<'ATTEMPTS_EXHAUSTED'> {
  readonly retryAfterSeconds: number;
}

export type RewardRejection =
  FeedbackPending | RewardCooldownActive | AttemptsExhausted;
