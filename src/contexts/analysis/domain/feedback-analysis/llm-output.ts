import { isSentiment } from '../sentiment.js';
import type { SpamReason } from '../spam-reason.js';
import type { LlmVerdict } from './analysis-result.js';

const KEYS = ['sentiment', 'topicKey', 'isValid', 'spamReason'] as const;
const SPAM_REASONS: readonly unknown[] = [
  'gibberish',
  'off_topic',
  'advertisement',
  'other',
] satisfies SpamReason[];

type Candidate = Readonly<Record<(typeof KEYS)[number], unknown>>;

/** Exactly the four fields of the schema, nothing more (SDD 8.2: a narrow output space). */
const hasExactKeys = (value: unknown): value is Candidate =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === KEYS.length &&
  KEYS.every((key) => Object.hasOwn(value, key));

/** A valid comment has no spam reason; spam must name one of the four. */
const spamReasonFits = (isValid: boolean, spamReason: unknown): boolean =>
  isValid ? spamReason === null : SPAM_REASONS.includes(spamReason);

/**
 * Checks the model's answer in the application, whatever the provider enforced (FR-AI-03, SDD 8.1):
 * the fixed sentiment set, a topic from the branch sector's current label set (FR-AI-04), a
 * boolean `isValid`, and a spam reason only for spam. Undefined means off-schema: the attempt
 * failed as `invalid_response`, which never earns a reward (T-T6).
 */
export function parseLlmOutput(
  output: unknown,
  topicKeys: readonly string[],
): LlmVerdict | undefined {
  if (!hasExactKeys(output)) return undefined;
  const { sentiment, topicKey, isValid, spamReason } = output;
  const fits =
    isSentiment(sentiment) &&
    typeof topicKey === 'string' &&
    topicKeys.includes(topicKey) &&
    typeof isValid === 'boolean' &&
    spamReasonFits(isValid, spamReason);
  return fits
    ? {
        sentiment,
        topicKey,
        isValid,
        spamReason: spamReason as SpamReason | null,
      }
    : undefined;
}
