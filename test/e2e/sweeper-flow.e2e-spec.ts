// S0-10 slice 3 through the real application: when the LLM provider keeps failing, the worker's
// scheduled sweeper closes the feedback 24 hours after submission, and the reward follows the
// SRS CR-007 rule: given after an outage (TC-AI-04), never after off-schema answers (TC-AI-11).

import type { InProcessWorker } from '../../src/composition/in-process-worker.js';
import type { SweepUnanalyzedFeedback } from '../../src/contexts/feedback/application/use-cases/sweep-unanalyzed-feedback.js';
import { JOB_WORKER, SWEEP_UNANALYZED } from '../../src/composition/tokens.js';
import {
  completion,
  startFakeOpenAi,
  type FakeOpenAiServer,
} from '../support/fake-openai-server.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';

const HOUR = 3_600_000;

describe('the 24-hour sweeper through the worker (e2e)', () => {
  let provider: FakeOpenAiServer;
  let feedback: FeedbackApp;
  let worker: InProcessWorker;

  beforeEach(async () => {
    provider = await startFakeOpenAi();
    vi.stubEnv('LLM_DRIVER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_MODEL', 'gpt-test');
    vi.stubEnv('OPENAI_BASE_URL', provider.baseUrl);
    feedback = await startFeedbackApp();
    worker = feedback.running.app.get<InProcessWorker>(JOB_WORKER);
  });

  afterEach(async () => {
    await feedback.running.app.close();
    await provider.close();
    vi.unstubAllEnvs();
  });

  /** Submits, lets the worker fail once, then moves past the 24 hours and ticks again. */
  const closedAfter24Hours = async () => {
    const response = await feedback.client.submit();
    const { feedbackId } = response.body as { feedbackId: string };
    await worker.tick();
    feedback.running.clock.advance(24 * HOUR);
    await feedback.renewSession();
    await worker.tick();
    return (await feedback.client.status(feedbackId)).body as {
      status: string;
      reward: unknown;
    };
  };

  it('closes the feedback as unanalyzed and rewards it after a provider outage (TC-AI-04)', async () => {
    provider.script = [
      { status: 503, body: { error: { message: 'overloaded' } } },
    ];

    expect(await closedAfter24Hours()).toMatchObject({
      status: 'unanalyzed',
      reward: { xp: 10, points: 5 },
    });
  });

  it('closes it without a reward when the provider only answered off-schema (TC-AI-11, T-T6)', async () => {
    provider.script = [completion('{"verdict":"good"}')];

    expect(await closedAfter24Hours()).toMatchObject({
      status: 'unanalyzed',
      reward: null,
    });
  });

  it('frees the branch: the user can send a new feedback there right after the close', async () => {
    provider.script = [
      { status: 503, body: { error: { message: 'overloaded' } } },
    ];
    await closedAfter24Hours();

    expect((await feedback.client.submit()).status).toBe(202);
  });
  // Two worker processes both run the sweeper every minute (the schedule is per process). Closing a
  // feedback must therefore be safe to run twice at once; PostgreSQL repeats this in S0-11.
  it('closes and rewards a feedback once when two sweeps run at the same time', async () => {
    const sweep =
      feedback.running.app.get<SweepUnanalyzedFeedback>(SWEEP_UNANALYZED);
    provider.script = [
      { status: 503, body: { error: { message: 'overloaded' } } },
    ];
    const { feedbackId } = (await feedback.client.submit()).body as {
      feedbackId: string;
    };
    await worker.tick();
    feedback.running.clock.advance(24 * HOUR);
    await feedback.renewSession();

    const reports = await Promise.all([sweep.execute(), sweep.execute()]);

    expect(reports.flatMap((report) => report.failures)).toEqual([]);
    expect(reports.reduce((total, report) => total + report.closed, 0)).toBe(1);
    expect((await feedback.client.status(feedbackId)).body).toMatchObject({
      status: 'unanalyzed',
      reward: { xp: 10, points: 5 },
    });
    expect(
      (await feedback.auth.wallet(feedback.client.token)).body,
    ).toMatchObject({ xp: 10 });
  });
});
