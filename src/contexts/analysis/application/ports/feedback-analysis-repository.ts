import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type { FeedbackAnalysis } from '../../domain/feedback-analysis/feedback-analysis.js';

export interface FeedbackAnalysisRepository {
  /** The analysis of this feedback, or undefined before its first attempt. */
  find(feedbackId: FeedbackId): Promise<FeedbackAnalysis | undefined>;
  /** Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version. Inside a unit of work. */
  save(analysis: FeedbackAnalysis): Promise<void>;
}
