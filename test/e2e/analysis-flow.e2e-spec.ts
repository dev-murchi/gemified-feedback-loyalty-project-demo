// S0-08 through the real application: a feedback sent over HTTP, analyzed by ProcessAnalysisJob
// (run here directly; the queue and the worker are S0-10), rewarded in the same transaction, and
// shown by GET /v1/feedbacks/{id} and the wallet. Every HTTP response is checked against the contract.

import type { ProcessAnalysisJob } from '../../src/contexts/analysis/application/use-cases/process-analysis-job.js';
import { PROCESS_ANALYSIS_JOB } from '../../src/composition/tokens.js';
import type { FeedbackId } from '../../src/shared-kernel/ids.js';
import {
  completion,
  startFakeOpenAi,
  type FakeOpenAiServer,
} from '../support/fake-openai-server.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';

describe('analysis through the application (e2e)', () => {
  let feedback: FeedbackApp;

  afterEach(async () => {
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });

  /** Sends a comment over HTTP and runs its analysis job, as the worker will. */
  const submitAndAnalyze = async (text?: string) => {
    const response = await feedback.client.submit(
      text === undefined ? {} : { text },
    );
    expect(response.status).toBe(202);
    const accepted = response.body as {
      feedbackId: string;
      submittedAt: string;
    };
    const job =
      feedback.running.app.get<ProcessAnalysisJob>(PROCESS_ANALYSIS_JOB);
    const outcome = await job.execute({
      feedbackId: accepted.feedbackId as FeedbackId,
      sector: 'fuel',
      submittedAt: new Date(accepted.submittedAt),
    });
    return { id: accepted.feedbackId, outcome };
  };

  describe('with the demo stand-in (LLM_DRIVER unset)', () => {
    beforeEach(async () => {
      feedback = await startFeedbackApp();
    });

    it('analyzes a feedback and rewards it: status and wallet show it (US-04, FR-GAM-01)', async () => {
      const { id, outcome } = await submitAndAnalyze();

      expect(outcome).toEqual({ outcome: 'analyzed' });
      const status = await feedback.client.status(id);
      expect(status.body).toMatchObject({
        status: 'valid',
        reward: { xp: 10, points: 5 },
      });
      const wallet = await feedback.auth.wallet(feedback.client.token);
      expect(wallet.body).toMatchObject({ xp: 10, points: 5 });
    });

    it('marks gibberish as spam without a reward and frees the branch for a new attempt', async () => {
      const { id } = await submitAndAnalyze('aaaaaaaaaaaaaaaaaaaaaaaaa');

      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'spam',
        reward: null,
      });
      expect((await feedback.client.submit()).status).toBe(202);
    });
  });

  describe('with the OpenAI adapter against a local fake provider', () => {
    let provider: FakeOpenAiServer;

    beforeEach(async () => {
      provider = await startFakeOpenAi();
      provider.script = [
        completion(
          JSON.stringify({
            sentiment: 'angry',
            topicKey: 'other',
            isValid: true,
            spamReason: null,
          }),
        ),
      ];
      vi.stubEnv('LLM_DRIVER', 'openai');
      vi.stubEnv('OPENAI_API_KEY', 'sk-test');
      vi.stubEnv('OPENAI_MODEL', 'gpt-test');
      vi.stubEnv('OPENAI_BASE_URL', provider.baseUrl);
      feedback = await startFeedbackApp();
    });

    afterEach(() => provider.close());

    it('sends the provider only the masked comment, then stores and rewards the answer (FR-AI-07)', async () => {
      const { id, outcome } = await submitAndAnalyze(
        'Pompa bozuktu, beni 0532 123 45 67 numarasından arayın lütfen.',
      );

      expect(outcome).toEqual({ outcome: 'analyzed' });
      const sent = JSON.stringify(provider.received[0]?.body);
      expect(sent).toContain('[TELEFON]');
      expect(sent).not.toContain('0532');
      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'valid',
        reward: { xp: 10, points: 5 },
      });
    });

    it('keeps the feedback analyzing when the provider is down, and schedules a retry (TC-AI-03)', async () => {
      provider.script = [
        { status: 503, body: { error: { message: 'overloaded' } } },
      ];

      const { id, outcome } = await submitAndAnalyze();

      expect(outcome).toMatchObject({ outcome: 'retry' });
      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'analyzing',
      });
    });
  });
});
