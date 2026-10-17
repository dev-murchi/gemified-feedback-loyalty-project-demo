import type { Clock } from '../../../../shared-kernel/clock.js';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import { ANALYSIS_DEADLINE_MS } from '../../domain/feedback/feedback.js';
import type { FeedbackRepository } from '../ports/feedback-repository.js';
import type { FinalizeUnanalyzedFeedback } from './finalize-unanalyzed-feedback.js';

export interface SweepUnanalyzedFeedbackDeps {
  readonly feedbacks: FeedbackRepository;
  readonly finalize: FinalizeUnanalyzedFeedback;
  readonly clock: Clock;
}

/** One feedback the sweep could not close; the next sweep tries it again. */
export interface SweepFailure {
  readonly feedbackId: FeedbackId;
  /** The error's name and message, never comment text. */
  readonly error: string;
}

export interface SweepReport {
  readonly closed: number;
  readonly failures: readonly SweepFailure[];
}

const BATCH = 100;
const MAX_BATCHES = 10;

const reasonOf = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';

/**
 * The 24-hour sweeper (FR-AI-09, ADR-005; scheduled by the worker, S0-10): closes every feedback
 * still analyzing 24 hours after submission through FinalizeUnanalyzedFeedback, oldest first, in
 * batches. One feedback that cannot be closed is reported and does not block the others; the next
 * sweep tries it again. Each close is its own unit of work, so a failure rolls back only itself.
 */
export class SweepUnanalyzedFeedback {
  constructor(private readonly deps: SweepUnanalyzedFeedbackDeps) {}

  async execute(): Promise<SweepReport> {
    const cutoff = new Date(
      this.deps.clock.now().getTime() - ANALYSIS_DEADLINE_MS,
    );
    const failed = new Map<FeedbackId, string>();
    let closed = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const due = (
        await this.deps.feedbacks.findAnalyzingSubmittedAtOrBefore(
          cutoff,
          BATCH + failed.size,
        )
      )
        .filter((id) => !failed.has(id))
        .slice(0, BATCH);
      if (due.length === 0) break;
      for (const id of due) {
        const outcome = await this.#close(id);
        if (outcome === 'closed') closed += 1;
        else if (outcome !== 'skipped') failed.set(id, outcome.error);
      }
    }
    return {
      closed,
      failures: [...failed].map(([feedbackId, error]) => ({
        feedbackId,
        error,
      })),
    };
  }

  async #close(
    id: FeedbackId,
  ): Promise<'closed' | 'skipped' | { readonly error: string }> {
    try {
      const outcome = await this.deps.finalize.execute({ feedbackId: id });
      return outcome === 'closed' ? 'closed' : 'skipped';
    } catch (error) {
      return { error: reasonOf(error) };
    }
  }
}
