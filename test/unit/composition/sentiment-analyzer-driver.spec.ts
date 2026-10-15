import { DemoSentimentAnalyzer } from '../../../src/contexts/analysis/adapters/outbound/fake/demo-sentiment.analyzer.js';
import { OpenAiSentimentAnalyzer } from '../../../src/contexts/analysis/adapters/outbound/openai/openai-sentiment.analyzer.js';
import { sentimentAnalyzerFor } from '../../../src/composition/sentiment-analyzer-driver.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const logger = new RecordingLogger();
const OPENAI = {
  LLM_DRIVER: 'openai',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_MODEL: 'gpt-test',
};

describe('sentimentAnalyzerFor (LLM_DRIVER, FR-AI-06)', () => {
  it('uses the demo stand-in when no driver is set outside production', () => {
    expect(
      sentimentAnalyzerFor({ NODE_ENV: 'development' }, logger),
    ).toBeInstanceOf(DemoSentimentAnalyzer);
    expect(
      sentimentAnalyzerFor({ NODE_ENV: 'test', LLM_DRIVER: 'fake' }, logger),
    ).toBeInstanceOf(DemoSentimentAnalyzer);
  });

  it.each([undefined, '', 'fake'])(
    'refuses the demo stand-in in production (LLM_DRIVER=%s)',
    (driver) => {
      expect(() =>
        sentimentAnalyzerFor(
          { NODE_ENV: 'production', LLM_DRIVER: driver },
          logger,
        ),
      ).toThrow(
        'DemoSentimentAnalyzer must not be used with NODE_ENV=production',
      );
    },
  );

  it('uses the OpenAI adapter with a key and a model, also in production', () => {
    expect(
      sentimentAnalyzerFor({ ...OPENAI, NODE_ENV: 'production' }, logger),
    ).toBeInstanceOf(OpenAiSentimentAnalyzer);
  });

  it('does not start with LLM_DRIVER=openai and no key', () => {
    expect(() =>
      sentimentAnalyzerFor({ ...OPENAI, OPENAI_API_KEY: '' }, logger),
    ).toThrow('OPENAI_API_KEY is required');
  });

  it('does not start with an unknown driver', () => {
    expect(() =>
      sentimentAnalyzerFor({ LLM_DRIVER: 'gemini' }, logger),
    ).toThrow('Unknown LLM_DRIVER "gemini"');
  });
});
