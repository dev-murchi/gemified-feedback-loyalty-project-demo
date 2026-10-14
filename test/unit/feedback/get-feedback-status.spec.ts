import type { FeedbackId, UserId } from '../../../src/shared-kernel/ids.js';
import {
  after,
  OTHER_IDEMPOTENCY_KEY,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  T0,
} from '../../support/feedback-builders.js';
import { BRANCH_NAME, OTHER_QR_TOKEN } from '../../support/feedback-fakes.js';
import {
  aSubmission,
  bodyOf,
  COMMENT,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

const OTHER_USER_ID = 'a0000000-0000-4000-8000-0000000000f2' as UserId;

describe('GetFeedbackStatus (FR-GAM-06, TC-GAM-09)', () => {
  let fixture: SubmissionFixture;
  let id: FeedbackId;

  beforeEach(async () => {
    // Given a feedback the test user submitted
    fixture = await submissionFixture();
    const submitted = await fixture.submit.execute(aSubmission());
    if (!submitted.ok) throw new Error('set-up submission was rejected');
    id = submitted.value.feedbackId;
  });

  const statusOf = (feedbackId: string, userId = FEEDBACK_USER_ID) =>
    fixture.status.execute({ userId, feedbackId });

  /** Applies a verdict to the stored feedback, the way ApplyAnalysisResult will (slice 4). */
  const givenVerdict = async (verdict: 'valid' | 'spam') => {
    const feedback = await fixture.harness.feedbacks.find(id);
    if (feedback === undefined) throw new Error('feedback is not stored');
    feedback.applyAnalysis({
      verdict,
      maskedText: 'maskeli',
      analyzedAt: after(0, 1),
    });
    await fixture.harness.uow.run(() =>
      fixture.harness.feedbacks.save(feedback),
    );
  };

  it('shows an analyzing feedback with its branch and no reward yet', async () => {
    expect(await statusOf(id)).toEqual({
      ok: true,
      value: {
        feedbackId: id,
        status: 'analyzing',
        submittedAt: T0,
        analyzedAt: null,
        branch: { id: FEEDBACK_BRANCH_ID, name: BRANCH_NAME },
        reward: null,
        levelUp: null,
      },
    });
  });

  it('shows a valid feedback with the reward and the level-up it earned (FR-GAM-05)', async () => {
    await givenVerdict('valid');
    fixture.rewards.rewards.set(id, {
      xp: 10,
      points: 5,
      levelUp: { from: 1, to: 2 },
    });

    expect(await statusOf(id)).toMatchObject({
      ok: true,
      value: {
        status: 'valid',
        analyzedAt: after(0, 1),
        reward: { xp: 10, points: 5 },
        levelUp: { from: 1, to: 2 },
      },
    });
  });

  it('shows a reward without a level-up as levelUp null', async () => {
    await givenVerdict('valid');
    fixture.rewards.rewards.set(id, { xp: 10, points: 5, levelUp: null });

    expect(await statusOf(id)).toMatchObject({
      ok: true,
      value: { reward: { xp: 10, points: 5 }, levelUp: null },
    });
  });

  it('shows a spam feedback without a reward', async () => {
    await givenVerdict('spam');

    expect(await statusOf(id)).toMatchObject({
      ok: true,
      value: { status: 'spam', reward: null, levelUp: null },
    });
  });

  it.each([
    ['another user’s feedback', () => statusOf(id, OTHER_USER_ID)],
    ['an unknown id', () => statusOf('f0000000-0000-4000-8000-000000000999')],
    ['a malformed id', () => statusOf('not-a-uuid')],
  ])(
    'answers NOT_FOUND for %s, so ids cannot be probed',
    async (_case, query) => {
      expect(await query()).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    },
  );

  it('fails loudly when Catalog no longer knows the feedback’s branch (data inconsistency, 500)', async () => {
    // Given a feedback at a branch the directory has no name for
    const other = await fixture.submit.execute(
      aSubmission({
        qrToken: OTHER_QR_TOKEN,
        idempotencyKey: OTHER_IDEMPOTENCY_KEY,
        body: bodyOf(COMMENT, OTHER_QR_TOKEN),
      }),
    );
    if (!other.ok) throw new Error('set-up submission was rejected');

    // Then the query throws instead of inventing a name
    await expect(statusOf(other.value.feedbackId)).rejects.toThrow(
      'is missing',
    );
  });
});
