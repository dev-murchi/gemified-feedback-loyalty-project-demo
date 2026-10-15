// S0-07 over real HTTP: POST /v1/feedbacks. Every response is also checked against the contract.

import { randomUUID } from 'node:crypto';
import { problemOf } from '../support/auth-client.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';
import { COMMENT, demoBranches } from '../support/feedback-client.js';

interface AcceptedBody {
  feedbackId: string;
  status: string;
  submittedAt: string;
  rewardEligible: boolean;
}

describe('POST /v1/feedbacks (e2e)', () => {
  let feedback: FeedbackApp;

  beforeEach(async () => {
    feedback = await startFeedbackApp();
  });

  afterEach(async () => {
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });

  it('accepts a feedback with 202, its address and reward eligibility (US-02)', async () => {
    const response = await feedback.client.submit();

    const body = response.body as AcceptedBody;
    expect(response.status).toBe(202);
    expect(body).toEqual({
      feedbackId: expect.any(String) as string,
      status: 'analyzing',
      submittedAt: '2026-10-13T09:00:00.000Z',
      rewardEligible: true,
    });
    expect(response.headers['location']).toBe(
      `/v1/feedbacks/${body.feedbackId}`,
    );
    expect(response.headers['idempotent-replayed']).toBe('false');
  });

  it.each([
    ['no proof', null],
    ['a proof of another body', 'MEUCIQDx'],
  ])(
    'accepts a feedback with %s, without a reward (FR-QR-10, TC-AUTH-07)',
    async (_case, proof) => {
      const response = await feedback.client.submit({ proof });

      expect(response.status).toBe(202);
      expect((response.body as AcceptedBody).rewardEligible).toBe(false);
    },
  );

  it('checks the proof over the bytes as sent, so formatted JSON with a valid proof is rewarded', async () => {
    // Given a body with spaces and line breaks that re-serialized JSON would not reproduce
    const rawBody = JSON.stringify(
      { qrToken: demoBranches[0]?.token, text: COMMENT },
      null,
      2,
    );

    // When it is sent with a proof over exactly those bytes
    const response = await feedback.client.submit({ rawBody });

    // Then the proof is valid
    expect(response.status).toBe(202);
    expect((response.body as AcceptedBody).rewardEligible).toBe(true);
  });

  it('answers a repeated request with the first answer and Idempotent-Replayed (FR-AI-10, TC-QR-10)', async () => {
    const key = randomUUID();
    const first = await feedback.client.submit({ idempotencyKey: key });

    const repeated = await feedback.client.submit({ idempotencyKey: key });

    expect(repeated.status).toBe(202);
    expect(repeated.body).toEqual(first.body);
    expect(repeated.headers['idempotent-replayed']).toBe('true');
  });

  it('rejects the same key with a different body: 422 IDEMPOTENCY_KEY_MISMATCH', async () => {
    const key = randomUUID();
    await feedback.client.submit({ idempotencyKey: key });

    const other = await feedback.client.submit({
      idempotencyKey: key,
      text: `${COMMENT} Su da yoktu.`,
    });

    expect(other.status).toBe(422);
    expect(problemOf(other).code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('rejects a new feedback while the previous one is analyzed: 409 FEEDBACK_PENDING (TC-QR-06)', async () => {
    await feedback.client.submit();

    const second = await feedback.client.submit();

    expect(second.status).toBe(409);
    expect(problemOf(second).code).toBe('FEEDBACK_PENDING');
  });

  it('accepts exactly one of 20 parallel feedbacks to one branch (TC-QR-01)', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => feedback.client.submit()),
    );

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 202)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(19);
  });

  describe('text length (TC-API-02, FR-AI-01)', () => {
    it('accepts 1 000 emoji and rejects 1 001 with 422 TEXT_TOO_LONG, not 400', async () => {
      const accepted = await feedback.client.submit({
        text: '😀'.repeat(1000),
      });
      const tooLong = await feedback.client.submit({
        text: '😀'.repeat(1001),
        qrToken: demoBranches[1]?.token,
      });

      expect(accepted.status).toBe(202);
      expect(tooLong.status).toBe(422);
      expect(problemOf(tooLong).code).toBe('TEXT_TOO_LONG');
    });

    it('rejects a short text with 422 TEXT_TOO_SHORT', async () => {
      const response = await feedback.client.submit({ text: 'Kötüydü.' });

      expect(response.status).toBe(422);
      expect(problemOf(response).code).toBe('TEXT_TOO_SHORT');
    });
  });

  it.each([
    ['an unknown', 'AAAAAAAAAAAAAAAAAAAAAA'],
    ['a malformed', 'not a token'],
  ])(
    'rejects %s QR token with 422 QR_INVALID and logs the attempt (TC-QR-07)',
    async (_case, qrToken) => {
      const response = await feedback.client.submit({ qrToken });

      expect(response.status).toBe(422);
      expect(problemOf(response).code).toBe('QR_INVALID');
      expect(feedback.running.logger.warnings.map((w) => w.message)).toContain(
        'Feedback with an invalid QR token rejected',
      );
    },
  );

  describe('request format: 400 VALIDATION_ERROR', () => {
    it('without an Idempotency-Key', async () => {
      const response = await feedback.client.submit({ idempotencyKey: null });

      expect(response.status).toBe(400);
      expect(problemOf(response).errors).toEqual([
        { field: 'Idempotency-Key', message: 'invalid value' },
      ]);
    });

    it('with a field the contract does not allow', async () => {
      const response = await feedback.client.submit({
        rawBody: JSON.stringify({
          qrToken: demoBranches[0]?.token,
          text: COMMENT,
          rating: 5,
        }),
      });

      expect(response.status).toBe(400);
      expect(problemOf(response).errors).toEqual([
        { field: 'rating', message: 'unexpected field' },
      ]);
    });
  });

  it('refuses a request without an access token: 401', async () => {
    const response = await feedback.client
      .http()
      .post('/v1/feedbacks')
      .set('Idempotency-Key', randomUUID())
      .send({ qrToken: demoBranches[0]?.token, text: COMMENT });

    expect(response.status).toBe(401);
  });
});
