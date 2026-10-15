import type {
  AnalyzerRequest,
  AnalyzerResponse,
  SentimentAnalyzer,
} from '../../../application/ports/sentiment-analyzer.js';
import { PROMPT_VERSION } from '../prompts/feedback-analysis-v1.js';

/**
 * LLM_DRIVER=fake: a stand-in for running the demo and the e2e tests without a provider key. It
 * labels every comment as valid, neutral, topic `other`, and never calls anything. It refuses to
 * exist in production, like the development verifiers (TC-AUTH-09, T-E3).
 */
export class DemoSentimentAnalyzer implements SentimentAnalyzer {
  private constructor() {}

  static forEnvironment(nodeEnv: string | undefined): DemoSentimentAnalyzer {
    if (nodeEnv === 'production')
      throw new Error(
        'DemoSentimentAnalyzer must not be used with NODE_ENV=production',
      );
    return new DemoSentimentAnalyzer();
  }

  analyze(request: AnalyzerRequest): Promise<AnalyzerResponse> {
    const other = request.topics.find((topic) => topic.key === 'other');
    return Promise.resolve({
      outcome: 'answered',
      output: {
        sentiment: 'neutral',
        topicKey: other?.key ?? request.topics[0]?.key ?? 'other',
        isValid: true,
        spamReason: null,
      },
      model: 'demo-fake',
      promptVersion: PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
    });
  }
}
