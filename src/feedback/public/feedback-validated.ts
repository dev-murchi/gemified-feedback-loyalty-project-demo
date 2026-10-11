import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { FeedbackId, UserId } from '../../shared-kernel/ids.js';

/**
 * Published by Feedback when a feedback is accepted as valid (docs/06 §6); Gamification awards the
 * reward in the same unit of work. Contract written first, in S0-06; Feedback (S0-07) publishes
 * exactly this type.
 */
export interface FeedbackValidated extends DomainEvent<'FeedbackValidated'> {
  /** The validated feedback; also the ledger key `reward:{feedbackId}`. */
  readonly aggregateId: FeedbackId;
  /** Whose wallet gets the reward. */
  readonly userId: UserId;
  /** When the customer submitted it; the ledger entry's earning date (FR-GAM-08). */
  readonly submittedAt: Date;
  /** False for low-trust submissions: validated, but no reward (FR-AUTH-06, FR-QR-10). */
  readonly rewardEligible: boolean;
}
