import { RewardCooldown } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-cooldown.js';
import { DEFAULT_REWARD_LIMITS } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import type { SubmitFeedbackResult } from '../../../src/contexts/feedback/application/use-cases/submit-feedback.js';
import type { FeedbackId } from '../../../src/shared-kernel/ids.js';
import type { Result } from '../../../src/shared-kernel/result.js';
import {
  after,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  feedbackId,
  OTHER_FEEDBACK_BRANCH_ID,
  OTHER_IDEMPOTENCY_KEY,
  QR_CODE_ID,
  T0,
} from '../../support/feedback-builders.js';
import { OTHER_QR_TOKEN, QR_TOKEN } from '../../support/feedback-fakes.js';
import {
  aSubmission,
  bodyOf,
  COMMENT,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

/** The first id a fresh SequentialIdGenerator hands out. */
const FIRST_ID = '00000000-0000-4000-8000-000000000001' as FeedbackId;

const errorOf = (result: Result<SubmitFeedbackResult, { code: string }>) =>
  result.ok ? undefined : result.error;

describe('SubmitFeedback', () => {
  let fixture: SubmissionFixture;

  beforeEach(async () => {
    fixture = await submissionFixture();
  });

  const stored = (id: FeedbackId = FIRST_ID) =>
    fixture.harness.feedbacks.find(id);
  const cooldown = (branchId = FEEDBACK_BRANCH_ID) =>
    fixture.harness.cooldowns.find(FEEDBACK_USER_ID, branchId);

  /** Stores a cooldown for the test user at the test branch before the request. */
  const givenCooldown = async (state: {
    lastRewardedAt?: Date | null;
    attemptTimes?: Date[];
    pendingFeedbackId?: FeedbackId | null;
  }) => {
    const existing = RewardCooldown.reconstitute(
      {
        userId: FEEDBACK_USER_ID,
        branchId: FEEDBACK_BRANCH_ID,
        lastRewardedAt: state.lastRewardedAt ?? null,
        attemptTimes: state.attemptTimes ?? [],
        pendingFeedbackId: state.pendingFeedbackId ?? null,
      },
      0,
      DEFAULT_REWARD_LIMITS,
    );
    await fixture.harness.uow.run(() =>
      fixture.harness.cooldowns.save(existing),
    );
  };

  /** Nothing of the request was stored: no feedback, no outbox record. */
  const expectNothingStored = async () => {
    expect(await stored()).toBeUndefined();
    expect(await fixture.harness.outbox()).toEqual([]);
  };

  describe('accepting a feedback (US-02)', () => {
    it('answers 202 data: analyzing, the submission time and reward eligibility', async () => {
      const result = await fixture.submit.execute(aSubmission());

      expect(result).toEqual({
        ok: true,
        value: {
          feedbackId: FIRST_ID,
          status: 'analyzing',
          submittedAt: T0,
          rewardEligible: true,
          replayed: false,
        },
      });
    });

    it('stores the feedback with its QR code, and the raw text only encrypted', async () => {
      await fixture.submit.execute(aSubmission());

      const feedback = await stored();
      expect(feedback).toMatchObject({
        status: 'analyzing',
        userId: FEEDBACK_USER_ID,
        branchId: FEEDBACK_BRANCH_ID,
        qrCodeId: QR_CODE_ID,
        correlationId: 'req-1',
      });
      const rawText = feedback?.rawText;
      if (rawText == null) throw new Error('raw text is not stored');
      expect(JSON.stringify(rawText)).not.toContain('Tuvaletler');
      expect(await fixture.cipher.decrypt(FIRST_ID, rawText)).toBe(COMMENT);
    });

    it('locks the branch for this user and counts the attempt (FR-QR-07, FR-QR-09)', async () => {
      await fixture.submit.execute(aSubmission());

      expect(await cooldown()).toMatchObject({
        pendingFeedbackId: FIRST_ID,
        attemptTimes: [T0],
      });
    });

    it('writes FeedbackSubmitted to the outbox with the branch and its sector (ADR-020)', async () => {
      await fixture.submit.execute(aSubmission({ correlationId: 'req-7' }));

      const records = await fixture.harness.outbox();
      expect(records.map((record) => record.payload)).toEqual([
        {
          type: 'FeedbackSubmitted',
          aggregateId: FIRST_ID,
          occurredAt: T0,
          branchId: FEEDBACK_BRANCH_ID,
          sector: 'fuel',
          submittedAt: T0,
          correlationId: 'req-7',
        },
      ]);
    });

    it('asks Identity about the proof over the key and the body exactly as received', async () => {
      const submission = aSubmission({ platformProof: 'c2lnbmF0dXJl' });

      await fixture.submit.execute(submission);

      expect(fixture.proofs.requests).toEqual([
        {
          userId: FEEDBACK_USER_ID,
          keyIdentifier: submission.keyIdentifier,
          idempotencyKey: submission.idempotencyKey,
          body: submission.body,
          proof: 'c2lnbmF0dXJl',
        },
      ]);
    });
  });

  describe('reward eligibility (FR-AUTH-06, FR-QR-10)', () => {
    it('is false for an invalid or missing proof, but the feedback is accepted (TC-AUTH-07)', async () => {
      fixture.proofs.verdict = 'invalid';

      const result = await fixture.submit.execute(
        aSubmission({ platformProof: undefined }),
      );

      expect(result).toMatchObject({
        ok: true,
        value: { rewardEligible: false },
      });
      expect((await stored())?.rewardEligible).toBe(false);
    });

    it('is false for a low-trust device even with a valid proof', async () => {
      const result = await fixture.submit.execute(
        aSubmission({ trustLevel: 'low' }),
      );

      expect(result).toMatchObject({
        ok: true,
        value: { rewardEligible: false },
      });
    });
  });

  describe('idempotency (FR-AI-10, TC-QR-10)', () => {
    it('answers a repeated request with the first answer, without a new feedback or attempt', async () => {
      // Given an accepted feedback
      await fixture.submit.execute(aSubmission());

      // When the same request comes again a minute later
      fixture.clock.set(after(0, 1));
      const repeated = await fixture.submit.execute(aSubmission());

      // Then it is the first answer, marked as replayed, and nothing new was written
      expect(repeated).toEqual({
        ok: true,
        value: {
          feedbackId: FIRST_ID,
          status: 'analyzing',
          submittedAt: T0,
          rewardEligible: true,
          replayed: true,
        },
      });
      expect((await cooldown())?.attemptTimes).toEqual([T0]);
      expect(await fixture.harness.outbox()).toHaveLength(1);
    });

    it('answers a repeated request even after its QR code was revoked', async () => {
      await fixture.submit.execute(aSubmission());
      fixture.qrCodes.revoked.add(QR_TOKEN);

      const repeated = await fixture.submit.execute(aSubmission());

      expect(repeated).toMatchObject({ ok: true, value: { replayed: true } });
    });

    it('rejects the same key with a different body as IDEMPOTENCY_KEY_MISMATCH', async () => {
      await fixture.submit.execute(aSubmission());

      const other = await fixture.submit.execute(
        aSubmission({ text: `${COMMENT} Ayrıca su yoktu.` }),
      );

      expect(errorOf(other)).toEqual({ code: 'IDEMPOTENCY_KEY_MISMATCH' });
    });

    it('lets concurrent copies of one request create a single feedback; the others are replays', async () => {
      // When five copies of the same request arrive together
      const results = await Promise.all(
        Array.from({ length: 5 }, () => fixture.submit.execute(aSubmission())),
      );

      // Then one feedback exists, and every answer names it
      const values = results.map((result) =>
        result.ok ? result.value : undefined,
      );
      expect(new Set(values.map((value) => value?.feedbackId))).toEqual(
        new Set([FIRST_ID]),
      );
      expect(values.filter((value) => value?.replayed === false)).toHaveLength(
        1,
      );
      expect(await fixture.harness.outbox()).toHaveLength(1);
    });

    it('rejects a malformed Idempotency-Key before anything else', async () => {
      const result = await fixture.submit.execute(
        aSubmission({ idempotencyKey: 'not-a-uuid' }),
      );

      expect(errorOf(result)).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'Idempotency-Key',
      });
      expect(fixture.proofs.requests).toEqual([]);
    });
  });

  describe('rejections that store nothing and use no attempt', () => {
    it.each([
      ['TEXT_TOO_SHORT', 'kısa'],
      ['TEXT_TOO_LONG', 'x'.repeat(1001)],
    ])(
      'rejects a text as %s (FR-AI-01, TC-AI-01: nothing is saved, so no analysis job and no LLM call)',
      async (code, text) => {
        const result = await fixture.submit.execute(aSubmission({ text }));

        expect(errorOf(result)?.code).toBe(code);
        await expectNothingStored();
        expect(await cooldown()).toBeUndefined();
      },
    );

    it('rejects an unknown or revoked QR token as QR_INVALID (FR-QR-02, TC-QR-07)', async () => {
      fixture.qrCodes.revoked.add(QR_TOKEN);

      const result = await fixture.submit.execute(aSubmission());

      expect(errorOf(result)).toEqual({ code: 'QR_INVALID' });
      await expectNothingStored();
      expect(fixture.proofs.requests).toEqual([]);
      expect(fixture.logger.warnings).toEqual([
        {
          message: 'Feedback with an invalid QR token rejected',
          fields: { userId: FEEDBACK_USER_ID, requestId: 'req-1' },
        },
      ]);
    });
  });

  describe('reward rules (TC-QR-02, 05, 06)', () => {
    it('rejects while an earlier feedback at this branch is analyzed: FEEDBACK_PENDING', async () => {
      await givenCooldown({
        attemptTimes: [T0],
        pendingFeedbackId: feedbackId(9),
      });
      fixture.clock.set(after(0, 5));

      const result = await fixture.submit.execute(aSubmission());

      expect(errorOf(result)).toEqual({ code: 'FEEDBACK_PENDING' });
      await expectNothingStored();
    });

    it('rejects 23:59 after a rewarded feedback: REWARD_COOLDOWN with the time left', async () => {
      await givenCooldown({ lastRewardedAt: T0, attemptTimes: [T0] });
      fixture.clock.set(after(23, 59));

      const result = await fixture.submit.execute(aSubmission());

      expect(errorOf(result)).toEqual({
        code: 'REWARD_COOLDOWN',
        retryAfterSeconds: 60,
      });
      await expectNothingStored();
    });

    it('rejects the fourth attempt in 24 hours: ATTEMPTS_EXHAUSTED with the time left', async () => {
      await givenCooldown({ attemptTimes: [T0, after(1), after(2)] });
      fixture.clock.set(after(3));

      const result = await fixture.submit.execute(aSubmission());

      expect(errorOf(result)).toEqual({
        code: 'ATTEMPTS_EXHAUSTED',
        retryAfterSeconds: 21 * 3600,
      });
      await expectNothingStored();
      expect((await cooldown())?.attemptTimes).toHaveLength(3);
    });

    it('keeps branches apart: a pending feedback at one branch does not block another', async () => {
      await fixture.submit.execute(aSubmission());

      const other = await fixture.submit.execute(
        aSubmission({
          qrToken: OTHER_QR_TOKEN,
          idempotencyKey: OTHER_IDEMPOTENCY_KEY,
          body: bodyOf(COMMENT, OTHER_QR_TOKEN),
        }),
      );

      expect(other.ok).toBe(true);
      expect(
        (await cooldown(OTHER_FEEDBACK_BRANCH_ID))?.pendingFeedbackId,
      ).toBe(other.ok ? other.value.feedbackId : undefined);
    });
  });
});
