// Published event: imports only the shared kernel, never Feedback's own value objects (docs/07 §4).

import type { DomainEvent } from '../../../../shared-kernel/domain-event.js';
import type { FeedbackId, UserId } from '../../../../shared-kernel/ids.js';

/**
 * Published by Feedback when a feedback is accepted as valid (docs/06 §6); Gamification awards the
 * reward in the same unit of work. Defined here so the Feedback aggregate (S0-07) can record it;
 * other contexts import it only from feedback/public/.
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
