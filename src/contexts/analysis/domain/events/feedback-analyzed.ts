// Published event: imports only the shared kernel, never Analysis's own value objects (docs/07 §4).

import type { DomainEvent } from '../../../../shared-kernel/domain-event.js';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';

/** The five sentiment labels (SDD 8, `Sentiment` in docs/api/openapi.yaml). */
export type AnalyzedSentiment =
  'happy' | 'satisfied' | 'neutral' | 'disappointed' | 'angry';

/**
 * Published by Analysis when a feedback has been analyzed (docs/06 §6); Feedback applies the verdict
 * in the same unit of work (ApplyAnalysisResult). The event type is defined here, by its publisher;
 * Analysis itself is built in S0-08, and other contexts import the type only from analysis/public/.
 */
export interface FeedbackAnalyzed extends DomainEvent<'FeedbackAnalyzed'> {
  /** The analyzed feedback (one analysis per feedback). */
  readonly aggregateId: FeedbackId;
  /** Valid feedback can earn a reward; spam cannot, and still used up the attempt (FR-QR-09). */
  readonly verdict: 'valid' | 'spam';
  /** The comment with personal data replaced by placeholders. */
  readonly maskedText: string;
  /**
   * Null only for spam found by the AI-free pre-checks, which never reach the LLM (owner decision
   * of S0-08); a valid verdict always has a sentiment.
   */
  readonly sentiment: AnalyzedSentiment | null;
  /** A key from the branch sector's versioned topic list (FR-AI-04); null like `sentiment`. */
  readonly topicKey: string | null;
  readonly analyzedAt: Date;
}
