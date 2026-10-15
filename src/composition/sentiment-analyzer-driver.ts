import { DemoSentimentAnalyzer } from '../contexts/analysis/adapters/outbound/fake/demo-sentiment.analyzer.js';
import { loadOpenAiConfig } from '../contexts/analysis/adapters/outbound/openai/openai-config.js';
import { OpenAiSentimentAnalyzer } from '../contexts/analysis/adapters/outbound/openai/openai-sentiment.analyzer.js';
import type { SentimentAnalyzer } from '../contexts/analysis/application/ports/sentiment-analyzer.js';
import type { Logger } from '../shared-kernel/logger.js';

/** The environment variables that choose and configure the LLM provider (FR-AI-06). */
export interface AnalyzerEnv {
  readonly NODE_ENV?: string | undefined;
  readonly LLM_DRIVER?: string | undefined;
  readonly OPENAI_API_KEY?: string | undefined;
  readonly OPENAI_MODEL?: string | undefined;
  readonly OPENAI_BASE_URL?: string | undefined;
}

/**
 * LLM_DRIVER: `openai`, or `fake` (the demo stand-in). Unset means `fake` outside production; in
 * production the fake refuses to start, so a real provider must be chosen. The Anthropic adapter
 * (Should) joins here as `anthropic`.
 */
export function sentimentAnalyzerFor(
  env: AnalyzerEnv,
  logger: Logger,
): SentimentAnalyzer {
  const driver =
    env.LLM_DRIVER === undefined || env.LLM_DRIVER === ''
      ? 'fake'
      : env.LLM_DRIVER;
  if (driver === 'fake')
    return DemoSentimentAnalyzer.forEnvironment(env.NODE_ENV);
  if (driver !== 'openai') throw new Error(`Unknown LLM_DRIVER "${driver}"`);
  const config = loadOpenAiConfig({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
  });
  return new OpenAiSentimentAnalyzer({ config, logger });
}
