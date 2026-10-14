import type { FeedbackId } from '../../../shared-kernel/ids.js';

/** What Analysis knows about a feedback it could not analyze in 24 hours (FR-AI-09). */
export interface UnanalyzedFindings {
  /** The masked comment if masking had finished, otherwise null. */
  readonly maskedText: string | null;
  /**
   * True only if the budget guard is off and the last failure was the LLM provider being
   * unreachable. An off-schema answer never allows a reward (threat T-T6); neither does a feedback
   * Analysis has no record of (SRS CR-007).
   */
  readonly rewardAllowed: boolean;
}

/**
 * Open host service (docs/06 §3, §5.4): Analysis's findings for the 24-hour close of a feedback.
 * Defined here by its publisher; Analysis implements it in S0-08.
 */
export interface UnanalyzedReport {
  findingsFor(feedbackId: FeedbackId): Promise<UnanalyzedFindings>;
}
