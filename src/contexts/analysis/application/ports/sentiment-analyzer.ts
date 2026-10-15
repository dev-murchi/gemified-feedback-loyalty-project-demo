import type { MaskedText } from '../../domain/masking/masked-text.js';

/** One analysis request: only the masked comment ever leaves the system (FR-AI-07). */
export interface AnalyzerRequest {
  readonly maskedText: MaskedText;
  /** The branch sector's current topics; the model must pick one of the keys. */
  readonly topics: readonly { readonly key: string; readonly name: string }[];
}

/**
 * The provider answered (its JSON output, not yet trusted), or could not be reached (network
 * error, timeout, 5xx, rate limit). Adapters never throw for the provider's own failures.
 */
export type AnalyzerResponse =
  | {
      readonly outcome: 'answered';
      readonly output: unknown;
      readonly model: string;
      readonly promptVersion: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  | { readonly outcome: 'unavailable' };

/**
 * The anti-corruption layer to the LLM provider (docs/06 §5.4, FR-AI-06): OpenAI, Anthropic or a
 * fake, chosen by LLM_DRIVER, without changing any business rule.
 */
export interface SentimentAnalyzer {
  analyze(request: AnalyzerRequest): Promise<AnalyzerResponse>;
}
