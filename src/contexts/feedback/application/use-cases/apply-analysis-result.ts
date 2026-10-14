import type { EventHandler } from '../../../../shared-kernel/event-routing.js';
import type { FeedbackAnalyzed } from '../../../analysis/public/feedback-analyzed.js';
import {
  saveClosedFeedback,
  type ClosingStores,
} from '../save-closed-feedback.js';

export type ApplyAnalysisResultDeps = ClosingStores;

/**
 * Handles FeedbackAnalyzed inside Analysis's unit of work (docs/06 §7, ADR-014). The verdict is
 * applied once: a valid feedback announces FeedbackValidated and, if it was eligible at submission,
 * starts the 24-hour cooldown from its submission time; spam releases the lock but keeps the
 * attempt used (FR-QR-09). A repeated event changes nothing (TC-GAM-01). Never retries itself:
 * a conflict rolls the unit of work back and the publisher reruns it.
 */
export class ApplyAnalysisResult implements EventHandler<FeedbackAnalyzed> {
  constructor(private readonly deps: ApplyAnalysisResultDeps) {}

  async handle(event: FeedbackAnalyzed): Promise<void> {
    const feedback = await this.deps.feedbacks.find(event.aggregateId);
    if (feedback === undefined)
      throw new Error(`Analyzed feedback ${event.aggregateId} does not exist`);
    const closing = feedback.applyAnalysis({
      verdict: event.verdict,
      maskedText: event.maskedText,
      analyzedAt: event.analyzedAt,
    });
    if (closing === 'ignored') return;
    const rewarded = event.verdict === 'valid' && feedback.rewardEligible;
    await saveClosedFeedback(
      this.deps,
      feedback,
      rewarded ? 'rewarded' : 'not_rewarded',
    );
  }
}
