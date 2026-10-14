import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import type { FeedbackId } from '../../../src/shared-kernel/ids.js';
import {
  after,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  T0,
} from '../../support/feedback-builders.js';
import {
  scriptedCooldowns,
  type ScriptedCooldowns,
} from '../../support/feedback-fakes.js';
import {
  aSubmission,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

describe('FinalizeUnanalyzedFeedback (FR-AI-09, SRS CR-007)', () => {
  let fixture: SubmissionFixture;

  const submitted = async (overrides = {}): Promise<FeedbackId> => {
    const result = await fixture.submit.execute(aSubmission(overrides));
    if (!result.ok)
      throw new Error(`set-up submission was rejected: ${result.error.code}`);
    return result.value.feedbackId;
  };

  const cooldown = () =>
    fixture.harness.cooldowns.find(FEEDBACK_USER_ID, FEEDBACK_BRANCH_ID);

  const finalizeAt = (at: Date, feedbackId: FeedbackId) => {
    fixture.clock.set(at);
    return fixture.finalize.execute({ feedbackId });
  };

  beforeEach(async () => {
    fixture = await submissionFixture();
  });

  it('leaves a feedback alone before 24 hours', async () => {
    const id = await submitted();

    expect(await finalizeAt(after(23, 59), id)).toBe('not_due');
    expect((await fixture.harness.feedbacks.find(id))?.status).toBe(
      'analyzing',
    );
    expect((await cooldown())?.pendingFeedbackId).toBe(id);
  });

  it('closes an eligible feedback at 24 hours, releases the lock and rewards it when allowed (TC-AI-04)', async () => {
    // Given an eligible feedback and Analysis saying the provider was unreachable
    const id = await submitted();
    fixture.report.findings = {
      maskedText: 'maskeli metin',
      rewardAllowed: true,
    };

    // When it is finalized exactly 24 hours after submission
    const outcome = await finalizeAt(after(24), id);

    // Then it is unanalyzed with the masked text, unlocked, and rewarded from its submission time
    expect(outcome).toBe('closed');
    expect(await fixture.harness.feedbacks.find(id)).toMatchObject({
      status: 'unanalyzed',
      maskedText: 'maskeli metin',
      analyzedAt: null,
    });
    expect(await cooldown()).toMatchObject({
      pendingFeedbackId: null,
      lastRewardedAt: T0,
    });
    expect(fixture.harness.validated).toMatchObject([
      {
        aggregateId: id,
        rewardEligible: true,
        submittedAt: T0,
        occurredAt: after(24),
      },
    ]);
  });

  it('closes without a reward when Analysis does not allow one, but still releases the lock (TC-AI-05, TC-AI-11)', async () => {
    const id = await submitted();
    fixture.report.findings = { maskedText: null, rewardAllowed: false };

    await finalizeAt(after(24), id);

    expect((await fixture.harness.feedbacks.find(id))?.status).toBe(
      'unanalyzed',
    );
    expect(await cooldown()).toMatchObject({
      pendingFeedbackId: null,
      lastRewardedAt: null,
    });
    expect(fixture.harness.validated).toMatchObject([
      { rewardEligible: false },
    ]);
  });

  it('never rewards a feedback that was not eligible at submission (TC-AI-05)', async () => {
    const id = await submitted({ trustLevel: 'low' });

    await finalizeAt(after(24), id);

    expect(await cooldown()).toMatchObject({
      pendingFeedbackId: null,
      lastRewardedAt: null,
    });
    expect(fixture.harness.validated).toMatchObject([
      { rewardEligible: false },
    ]);
  });

  it('lets the user send a new feedback at the branch right after the close (FR-AI-12)', async () => {
    const id = await submitted();
    fixture.report.findings = { maskedText: null, rewardAllowed: false };
    await finalizeAt(after(24), id);

    const next = await fixture.submit.execute(
      aSubmission({ idempotencyKey: '33333333-3333-4333-8333-333333333333' }),
    );

    expect(next.ok).toBe(true);
  });

  it('ignores a feedback its analysis already closed', async () => {
    const id = await submitted();
    await fixture.harness.uow.run(() =>
      fixture.apply.handle({
        type: 'FeedbackAnalyzed',
        aggregateId: id,
        occurredAt: after(1),
        verdict: 'spam',
        maskedText: 'x',
        sentiment: 'neutral',
        topicKey: 'other',
        analyzedAt: after(1),
      }),
    );

    expect(await finalizeAt(after(24), id)).toBe('ignored');
    expect((await fixture.harness.feedbacks.find(id))?.status).toBe('spam');
  });

  describe('conflicts (ADR-019)', () => {
    let cooldowns: ScriptedCooldowns | undefined;

    beforeEach(async () => {
      fixture = await submissionFixture({
        wrapCooldowns: (inner) => (cooldowns = scriptedCooldowns(inner)),
      });
    });

    const conflictNext = (times: number) => {
      if (cooldowns === undefined) throw new Error('cooldowns are not wrapped');
      cooldowns.conflictsLeft = times;
    };

    it('reruns the transaction after a conflict, but asks Analysis only once, before it', async () => {
      // Given a submitted feedback, and the next cooldown save conflicting once
      const id = await submitted();
      conflictNext(1);

      // When it is finalized
      const outcome = await finalizeAt(after(24), id);

      // Then the rerun closed it, and Analysis was asked a single time
      expect(outcome).toBe('closed');
      expect((await fixture.harness.feedbacks.find(id))?.status).toBe(
        'unanalyzed',
      );
      expect(fixture.report.asked).toEqual([id]);
    });

    it('fails with nothing changed after a second conflict', async () => {
      const id = await submitted();
      conflictNext(2);

      const run = finalizeAt(after(24), id);

      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect((await fixture.harness.feedbacks.find(id))?.status).toBe(
        'analyzing',
      );
      expect(fixture.harness.validated).toEqual([]);
    });
  });

  it('fails for a feedback that does not exist', async () => {
    const run = finalizeAt(
      after(24),
      'f0000000-0000-4000-8000-000000000999' as FeedbackId,
    );

    await expect(run).rejects.toThrow('does not exist');
  });
});
