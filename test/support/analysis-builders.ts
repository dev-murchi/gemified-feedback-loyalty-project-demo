// Small builders for Analysis tests.

import type {
  AnalysisResult,
  LlmProvenance,
} from '../../src/contexts/analysis/domain/feedback-analysis/analysis-result.js';
import { FeedbackAnalysis } from '../../src/contexts/analysis/domain/feedback-analysis/feedback-analysis.js';
import type { MaskedText } from '../../src/contexts/analysis/domain/masking/masked-text.js';
import type { FeedbackId } from '../../src/shared-kernel/ids.js';

export const ANALYZED_ID = 'f0000000-0000-4000-8000-0000000000a1' as FeedbackId;
export const SUBMITTED_AT = new Date('2026-10-16T09:00:00.000Z');
export const MASKED = 'Pompa bozuktu, [TELEFON] arayın' as MaskedText;

/** `minutes` after SUBMITTED_AT. */
export const minutesAfter = (minutes: number): Date =>
  new Date(SUBMITTED_AT.getTime() + minutes * 60_000);

export const PROVENANCE: LlmProvenance = {
  model: 'test-model',
  promptVersion: 'feedback-analysis/v1',
  labelSetVersion: 1,
  inputTokens: 600,
  outputTokens: 40,
};

export const llmResult = (
  isValid = true,
  at = minutesAfter(1),
): AnalysisResult => ({
  source: 'llm',
  verdict: {
    sentiment: 'angry',
    topicKey: 'pump',
    isValid,
    spamReason: isValid ? null : 'advertisement',
  },
  provenance: PROVENANCE,
  maskedText: MASKED,
  analyzedAt: at,
});

export const preCheckResult = (at = minutesAfter(0)): AnalysisResult => ({
  source: 'pre_check',
  spamReason: 'gibberish',
  maskedText: 'aaaaaaaaaaaaaaaaaaaaaaa' as MaskedText,
  analyzedAt: at,
});

/** A never-stored analysis of ANALYZED_ID before its first attempt. */
export const anAnalysis = (): FeedbackAnalysis =>
  FeedbackAnalysis.start(ANALYZED_ID, SUBMITTED_AT);
