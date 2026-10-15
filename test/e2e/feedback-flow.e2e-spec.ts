// S0-07 over real HTTP: the feedback status, the reward through the wired event routes
// (FeedbackAnalyzed → ApplyAnalysisResult → FeedbackValidated → AwardReward), and the reward rules'
// 422 answers (TC-API-01). Every response is also checked against the contract.

import { randomUUID } from 'node:crypto';
import { problemOf } from '../support/auth-client.js';
import { FakeDevice } from '../support/fake-device.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';
import { demoBranches } from '../support/feedback-client.js';

const HOUR = 3_600_000;

describe('feedback status and rewards (e2e)', () => {
  let feedback: FeedbackApp;

  beforeEach(async () => {
    feedback = await startFeedbackApp();
  });

  afterEach(async () => {
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });

  const submitted = async (): Promise<string> => {
    const response = await feedback.client.submit();
    expect(response.status).toBe(202);
    return (response.body as { feedbackId: string }).feedbackId;
  };

  it('shows an analyzing feedback to its owner with the branch (FR-GAM-06)', async () => {
    const id = await submitted();

    const response = await feedback.client.status(id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      feedbackId: id,
      status: 'analyzing',
      submittedAt: '2026-10-13T09:00:00.000Z',
      analyzedAt: null,
      branch: { id: demoBranches[0]?.id },
      reward: null,
      levelUp: null,
    });
  });

  it('rewards a valid feedback in the same transaction: status and wallet show it (FR-GAM-01)', async () => {
    // Given a feedback and, a few seconds later, its valid analysis
    const id = await submitted();
    feedback.running.clock.advance(4_000);
    await feedback.analyzed(id, 'valid');

    // Then the status shows the reward, and the wallet holds it
    const status = await feedback.client.status(id);
    expect(status.body).toMatchObject({
      status: 'valid',
      analyzedAt: '2026-10-13T09:00:04.000Z',
      reward: { xp: 10, points: 5 },
      levelUp: null,
    });
    const wallet = await feedback.auth.wallet(feedback.client.token);
    expect(wallet.body).toMatchObject({ xp: 10, points: 5, level: 1 });
  });

  it('answers 404 for another user’s, an unknown and a malformed feedback id', async () => {
    const id = await submitted();
    const other = new FakeDevice();
    const registered = await feedback.auth.register(other);
    const otherToken = (registered.body as { accessToken: string }).accessToken;

    const responses = await Promise.all([
      feedback.client.status(id, otherToken),
      feedback.client.status(randomUUID()),
      feedback.client.status('not-a-uuid'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404,
    ]);
  });

  describe('reward rules over HTTP (TC-API-01)', () => {
    it('rejects a feedback 23:59 after a rewarded one: 422 REWARD_COOLDOWN, time in the body, no Retry-After', async () => {
      const id = await submitted();
      await feedback.analyzed(id, 'valid');
      feedback.running.clock.advance(24 * HOUR - 60_000);
      await feedback.renewSession();

      const response = await feedback.client.submit();

      expect(response.status).toBe(422);
      expect(problemOf(response)).toMatchObject({
        code: 'REWARD_COOLDOWN',
        retryAfterSeconds: 60,
      });
      expect(response.headers['retry-after']).toBeUndefined();
    });

    it('rejects the fourth feedback in 24 hours after three spam verdicts: 422 ATTEMPTS_EXHAUSTED', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await feedback.analyzed(await submitted(), 'spam');
        feedback.running.clock.advance(HOUR);
        await feedback.renewSession();
      }

      const response = await feedback.client.submit();

      expect(response.status).toBe(422);
      expect(problemOf(response)).toMatchObject({
        code: 'ATTEMPTS_EXHAUSTED',
        retryAfterSeconds: 21 * 3600,
      });
      expect(response.headers['retry-after']).toBeUndefined();
    });
  });
});
