import type { MaskedText } from '../masking/masked-text.js';
import type { Sentiment } from '../sentiment.js';
import type { SpamReason } from '../spam-reason.js';

/** What the model answered, already checked against the schema and the label set (FR-AI-03). */
export interface LlmVerdict {
  readonly sentiment: Sentiment;
  readonly topicKey: string;
  readonly isValid: boolean;
  readonly spamReason: SpamReason | null;
}

/** How a result was produced, recorded with every LLM result (FR-AI-11). */
export interface LlmProvenance {
  readonly model: string;
  readonly promptVersion: string;
  readonly labelSetVersion: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** The stored result: from the LLM, or spam found by the pre-checks without any LLM call. */
export type AnalysisResult =
  | {
      readonly source: 'llm';
      readonly verdict: LlmVerdict;
      readonly provenance: LlmProvenance;
      readonly maskedText: MaskedText;
      readonly analyzedAt: Date;
    }
  | {
      readonly source: 'pre_check';
      readonly spamReason: 'gibberish';
      readonly maskedText: MaskedText;
      readonly analyzedAt: Date;
    };

/**
 * Why an attempt failed (FR-AI-09): the provider could not be reached, or it answered outside the
 * schema or the label set. Only the first may let a 24-hour close reward (SRS CR-007, T-T6).
 */
export type FailureKind = 'provider_unavailable' | 'invalid_response';
