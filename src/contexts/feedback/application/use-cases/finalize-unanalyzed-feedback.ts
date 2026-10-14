import type { Clock } from '../../../../shared-kernel/clock.js';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import { retryOnConflict } from '../../../../shared-kernel/retry-on-conflict.js';
import type { UnitOfWork } from '../../../../shared-kernel/unit-of-work.js';
import type {
  UnanalyzedFindings,
  UnanalyzedReport,
} from '../../../analysis/public/unanalyzed-report.js';
import {
  saveClosedFeedback,
  type ClosingStores,
} from '../save-closed-feedback.js';

export interface FinalizeUnanalyzedFeedbackDeps extends ClosingStores {
  readonly report: UnanalyzedReport;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface FinalizeUnanalyzedFeedbackCommand {
  readonly feedbackId: FeedbackId;
}

/** `closed`; `not_due` before 24 hours; `ignored` when it was already closed (by its analysis). */
export type FinalizeOutcome = 'closed' | 'not_due' | 'ignored';

/**
 * Closes a feedback still analyzing 24 hours after submission (FR-AI-09; run by the sweeper, S0-10).
 * It is always closed as `unanalyzed` and its branch lock released. It is rewarded only if it was
 * eligible at submission and Analysis allows it: budget guard off and the provider unreachable,
 * never after an off-schema answer (SRS CR-007, T-T6). Analysis is asked before the transaction.
 */
export class FinalizeUnanalyzedFeedback {
  constructor(private readonly deps: FinalizeUnanalyzedFeedbackDeps) {}

  async execute(
    cmd: FinalizeUnanalyzedFeedbackCommand,
  ): Promise<FinalizeOutcome> {
    const findings = await this.deps.report.findingsFor(cmd.feedbackId);
    return retryOnConflict(() =>
      this.deps.uow.run(() => this.#close(cmd.feedbackId, findings)),
    );
  }

  async #close(
    id: FeedbackId,
    findings: UnanalyzedFindings,
  ): Promise<FinalizeOutcome> {
    const feedback = await this.deps.feedbacks.find(id);
    if (feedback === undefined)
      throw new Error(`Feedback ${id} does not exist`);
    const now = this.deps.clock.now();
    if (feedback.status !== 'analyzing') return 'ignored';
    if (!feedback.isOverdueAt(now)) return 'not_due';
    feedback.closeUnanalyzed({
      closedAt: now,
      maskedText: findings.maskedText,
      rewardAllowed: findings.rewardAllowed,
    });
    const rewarded = feedback.rewardEligible && findings.rewardAllowed;
    await saveClosedFeedback(
      this.deps,
      feedback,
      rewarded ? 'rewarded' : 'not_rewarded',
    );
    return 'closed';
  }
}
