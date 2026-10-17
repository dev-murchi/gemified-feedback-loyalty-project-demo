// S0-10 slice 2 through the real application in one process: a feedback sent over HTTP goes to the
// outbox, the relay hands it to the in-memory queue, the worker runs its analysis, and the reward
// is given — no direct use-case call. The worker is driven tick by tick, not on its timer.

import type { InProcessWorker } from '../../src/composition/in-process-worker.js';
import { IN_PROCESS_WORKER } from '../../src/composition/tokens.js';
import {
  completion,
  startFakeOpenAi,
  type FakeOpenAiServer,
} from '../support/fake-openai-server.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';

describe('outbox → relay → queue → worker → reward (e2e, one process)', () => {
  let feedback: FeedbackApp;
  let worker: InProcessWorker;

  const submitted = async (): Promise<string> => {
    const response = await feedback.client.submit();
    expect(response.status).toBe(202);
    return (response.body as { feedbackId: string }).feedbackId;
  };

  afterEach(async () => {
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });

  describe('with the demo stand-in', () => {
    beforeEach(async () => {
      feedback = await startFeedbackApp();
      worker = feedback.running.app.get<InProcessWorker>(IN_PROCESS_WORKER);
    });

    it('analyzes and rewards a submitted feedback on the next tick (US-04, FR-GAM-01)', async () => {
      const id = await submitted();
      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'analyzing',
      });

      await worker.tick();

      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'valid',
        reward: { xp: 10, points: 5 },
      });
      expect(
        (await feedback.auth.wallet(feedback.client.token)).body,
      ).toMatchObject({ xp: 10 });
    });

    it('rewards once although the worker ticks again (the job is done, the outbox published)', async () => {
      await submitted();

      await worker.tick();
      await worker.tick();

      expect(
        (await feedback.auth.wallet(feedback.client.token)).body,
      ).toMatchObject({ xp: 10 });
    });
  });

  describe('with the OpenAI adapter against a local fake provider', () => {
    let provider: FakeOpenAiServer;

    beforeEach(async () => {
      provider = await startFakeOpenAi();
      provider.script = [
        { status: 503, body: { error: { message: 'overloaded' } } },
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
      worker = feedback.running.app.get<InProcessWorker>(IN_PROCESS_WORKER);
    });

    afterEach(() => provider.close());

    it('keeps the feedback analyzing during an outage and analyzes it when the retry is due (TC-AI-03)', async () => {
      const id = await submitted();

      await worker.tick();
      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'analyzing',
      });

      await worker.tick();
      expect(provider.received).toHaveLength(1);

      feedback.running.clock.advance(60_000);
      await feedback.renewSession();
      await worker.tick();

      expect(provider.received).toHaveLength(2);
      expect((await feedback.client.status(id)).body).toMatchObject({
        status: 'valid',
      });
    });
  });
});
