import type { FeedbackAnalyzed } from '../../../src/contexts/analysis/public/feedback-analyzed.js';
import type { FeedbackId } from '../../../src/shared-kernel/ids.js';
import {
  after,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  OTHER_IDEMPOTENCY_KEY,
  T0,
} from '../../support/feedback-builders.js';
import {
  aSubmission,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

describe('ApplyAnalysisResult (FeedbackAnalyzed handler)', () => {
  let fixture: SubmissionFixture;

  /** Submits as the test user, expecting acceptance; returns the new feedback's id. */
  const submitted = async (overrides = {}): Promise<FeedbackId> => {
    const result = await fixture.submit.execute(aSubmission(overrides));
    if (!result.ok)
      throw new Error(`set-up submission was rejected: ${result.error.code}`);
    return result.value.feedbackId;
  };

  const analyzed = (
    id: FeedbackId,
    verdict: 'valid' | 'spam',
    at = after(0, 2),
  ): FeedbackAnalyzed => ({
    type: 'FeedbackAnalyzed',
    aggregateId: id,
    occurredAt: at,
    verdict,
    maskedText: 'Pompa bozuktu, [TELEFON] numarasından arayın',
    sentiment: 'angry',
    topicKey: 'pump',
    analyzedAt: at,
  });

  /** Runs the handler the way Analysis will: inside its unit of work. */
  const apply = (event: FeedbackAnalyzed) =>
    fixture.harness.uow.run(() => fixture.apply.handle(event));

  const cooldown = () =>
    fixture.harness.cooldowns.find(FEEDBACK_USER_ID, FEEDBACK_BRANCH_ID);

  beforeEach(async () => {
    fixture = await submissionFixture();
  });

  it('closes a valid feedback, keeps the masked text and starts the cooldown from its submission (SDD 6.4)', async () => {
    // Given a reward-eligible feedback submitted at T0
    const id = await submitted();

    // When its analysis says valid two minutes later
    await apply(analyzed(id, 'valid'));

    // Then it is valid with the masked text, and the next reward counts from T0, not from 00:02
    const feedback = await fixture.harness.feedbacks.find(id);
    expect(feedback).toMatchObject({
      status: 'valid',
      maskedText: 'Pompa bozuktu, [TELEFON] numarasından arayın',
      analyzedAt: after(0, 2),
    });
    expect(await cooldown()).toMatchObject({
      pendingFeedbackId: null,
      lastRewardedAt: T0,
    });
  });

  it('announces FeedbackValidated in the same unit of work, so Gamification rewards it (FR-GAM-01)', async () => {
    const id = await submitted();

    await apply(analyzed(id, 'valid'));

    expect(fixture.harness.validated).toEqual([
      {
        type: 'FeedbackValidated',
        aggregateId: id,
        occurredAt: after(0, 2),
        userId: FEEDBACK_USER_ID,
        submittedAt: T0,
        rewardEligible: true,
      },
    ]);
  });

  it('releases the lock of a low-trust valid feedback without using the reward right (FR-AUTH-06)', async () => {
    const id = await submitted({ trustLevel: 'low' });

    await apply(analyzed(id, 'valid'));

    expect(await cooldown()).toMatchObject({
      pendingFeedbackId: null,
      lastRewardedAt: null,
    });
    expect(fixture.harness.validated).toMatchObject([
      { rewardEligible: false },
    ]);
  });

  it('releases the lock of spam, announces nothing and keeps the attempt used (FR-QR-09, TC-QR-04)', async () => {
    const id = await submitted();

    await apply(analyzed(id, 'spam'));

    expect((await fixture.harness.feedbacks.find(id))?.status).toBe('spam');
    expect(await cooldown()).toMatchObject({
      pendingFeedbackId: null,
      lastRewardedAt: null,
      attemptTimes: [T0],
    });
    expect(fixture.harness.validated).toEqual([]);
  });

  it('lets the user send a new feedback after spam: it is accepted as the second attempt', async () => {
    const id = await submitted();
    await apply(analyzed(id, 'spam'));
    fixture.clock.set(after(0, 10));

    const second = await fixture.submit.execute(
      aSubmission({ idempotencyKey: OTHER_IDEMPOTENCY_KEY }),
    );

    expect(second.ok).toBe(true);
    expect((await cooldown())?.attemptTimes).toEqual([T0, after(0, 10)]);
  });

  it('changes and announces nothing when the same event comes again (TC-GAM-01)', async () => {
    // Given an applied verdict
    const id = await submitted();
    await apply(analyzed(id, 'valid'));
    const version = (await fixture.harness.feedbacks.find(id))?.version;

    // When the job ran twice and the event is delivered again
    await apply(analyzed(id, 'valid', after(0, 5)));

    // Then nothing was saved or announced a second time
    const feedback = await fixture.harness.feedbacks.find(id);
    expect(feedback?.version).toBe(version);
    expect(feedback?.analyzedAt).toEqual(after(0, 2));
    expect(fixture.harness.validated).toHaveLength(1);
  });

  it('lets a late analysis of an older feedback change nothing, not even the newer lock (TC-QR-08)', async () => {
    // Given feedback A closed after 24 hours and a newer feedback B pending at the same branch
    const a = await submitted();
    fixture.report.findings = { maskedText: null, rewardAllowed: false };
    fixture.clock.set(after(24));
    await fixture.finalize.execute({ feedbackId: a });
    fixture.clock.set(after(25));
    const b = await submitted({ idempotencyKey: OTHER_IDEMPOTENCY_KEY });

    // When A's analysis finally arrives
    await apply(analyzed(a, 'valid', after(25, 1)));

    // Then A stays unanalyzed and B keeps the lock
    expect((await fixture.harness.feedbacks.find(a))?.status).toBe(
      'unanalyzed',
    );
    expect((await cooldown())?.pendingFeedbackId).toBe(b);
  });

  it('fails the unit of work for a feedback that does not exist', async () => {
    const run = apply(
      analyzed('f0000000-0000-4000-8000-000000000999' as FeedbackId, 'valid'),
    );

    await expect(run).rejects.toThrow('does not exist');
  });
});
