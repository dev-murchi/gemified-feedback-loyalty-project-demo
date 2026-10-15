import type {
  AnalyzerRequest,
  AnalyzerResponse,
  SentimentAnalyzer,
} from '../../src/contexts/analysis/application/ports/sentiment-analyzer.js';

/** A valid answer in the schema of SDD 8.1, with a topic of the fake fuel label set. */
export const VALID_OUTPUT = {
  sentiment: 'angry',
  topicKey: 'pump',
  isValid: true,
  spamReason: null,
};

export const answered = (output: unknown = VALID_OUTPUT): AnalyzerResponse => ({
  outcome: 'answered',
  output,
  model: 'fake-model',
  promptVersion: 'feedback-analysis/v1',
  inputTokens: 600,
  outputTokens: 40,
});

export const UNAVAILABLE: AnalyzerResponse = { outcome: 'unavailable' };

/**
 * A SentimentAnalyzer that answers from a script, one response per call (then the last one again),
 * and records every request, so a test can see what left the system and how often.
 */
export interface FakeSentimentAnalyzer extends SentimentAnalyzer {
  readonly requests: AnalyzerRequest[];
  script: AnalyzerResponse[];
}

export function fakeSentimentAnalyzer(): FakeSentimentAnalyzer {
  const fake: FakeSentimentAnalyzer = {
    requests: [],
    script: [answered()],
    analyze: (request) => {
      fake.requests.push(request);
      const response =
        fake.script.length > 1 ? fake.script.shift() : fake.script[0];
      return Promise.resolve(response ?? answered());
    },
  };
  return fake;
}
