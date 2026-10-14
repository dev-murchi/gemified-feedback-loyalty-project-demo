import type { SubmitFeedbackResult } from '../../../src/contexts/feedback/application/use-cases/submit-feedback.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import type { Result } from '../../../src/shared-kernel/result.js';
import {
  scriptedCooldowns,
  type ScriptedCooldowns,
} from '../../support/feedback-fakes.js';
import {
  aSubmission,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

const errorOf = (result: Result<SubmitFeedbackResult, { code: string }>) =>
  result.ok ? undefined : result.error;

describe('SubmitFeedback', () => {
  let fixture: SubmissionFixture;

  beforeEach(async () => {
    fixture = await submissionFixture();
  });

  /** Nothing of the request was stored: no outbox record (the feedback goes with it). */
  const expectNothingStored = async () => {
    expect(await fixture.harness.outbox()).toEqual([]);
  };

  describe('concurrency (ADR-019, TC-QR-01)', () => {
    it('accepts exactly one of 20 parallel feedbacks to one branch; the rest are FEEDBACK_PENDING', async () => {
      // When 20 different feedbacks of one user to one branch arrive together
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, n) =>
          fixture.submit.execute(
            aSubmission({
              idempotencyKey: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
            }),
          ),
        ),
      );

      // Then one is accepted and 19 are rejected as pending
      const accepted = results.filter((result) => result.ok);
      expect(accepted).toHaveLength(1);
      expect(
        results.map(errorOf).filter((e) => e?.code === 'FEEDBACK_PENDING'),
      ).toHaveLength(19);
      expect(await fixture.harness.outbox()).toHaveLength(1);
    });

    it('reloads and decides again after a conflict, so the retry succeeds', async () => {
      // Given a cooldown repository whose first save conflicts
      let wrapped: ScriptedCooldowns | undefined;
      fixture = await submissionFixture({
        wrapCooldowns: (inner) =>
          (wrapped = scriptedCooldowns(inner, { conflicts: 1 })),
      });

      // When a feedback is submitted
      const result = await fixture.submit.execute(aSubmission());

      // Then the unit of work ran twice, loading again, and the feedback was stored once
      expect(result.ok).toBe(true);
      expect(wrapped?.loads).toBe(2);
      expect(await fixture.harness.outbox()).toHaveLength(1);
    });

    it('lets a second conflict fail the request with nothing stored (500, docs/07 §5)', async () => {
      fixture = await submissionFixture({
        wrapCooldowns: (inner) => scriptedCooldowns(inner, { conflicts: 2 }),
      });

      const run = fixture.submit.execute(aSubmission());

      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      await expectNothingStored();
    });

    it('rolls the feedback back when a later write of the transaction fails (TC-GAM-06 style)', async () => {
      fixture = await submissionFixture({
        wrapCooldowns: (inner) =>
          scriptedCooldowns(inner, { failure: new Error('database is gone') }),
      });

      const run = fixture.submit.execute(aSubmission());

      await expect(run).rejects.toThrow('database is gone');
      await expectNothingStored();
    });
  });
});
