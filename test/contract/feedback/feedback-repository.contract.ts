import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { Feedback } from '../../../src/contexts/feedback/domain/feedback/feedback.js';
import {
  aFeedback,
  after,
  FEEDBACK_USER_ID,
  feedbackId,
  IDEMPOTENCY_KEY,
  OTHER_IDEMPOTENCY_KEY,
  RAW_TEXT,
  T0,
} from '../../support/feedback-builders.js';
import type { FeedbackHarness } from '../../support/memory-feedback.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

/** Everything a stored feedback must give back, compared as plain data. */
const stateOf = (feedback: Feedback | undefined) =>
  feedback && {
    id: feedback.id,
    userId: feedback.userId,
    branchId: feedback.branchId,
    idempotencyKey: feedback.idempotencyKey,
    requestFingerprint: feedback.requestFingerprint,
    status: feedback.status,
    rewardEligible: feedback.rewardEligible,
    correlationId: feedback.correlationId,
    submittedAt: feedback.submittedAt,
    analyzedAt: feedback.analyzedAt,
    maskedText: feedback.maskedText,
    rawText: feedback.rawText,
  };

export function feedbackRepositoryContract(
  makeHarness: () => Promise<FeedbackHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aFeedback(),
        save: (feedback) => harness.feedbacks.save(feedback),
        load: () => harness.feedbacks.find(feedbackId(1)),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: FeedbackHarness;
    const save = (feedback: Feedback) =>
      harness.uow.run(() => harness.feedbacks.save(feedback));

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('is not found before it is saved', async () => {
      expect(await harness.feedbacks.find(feedbackId(1))).toBeUndefined();
    });

    it('loads exactly what was saved, with the encrypted raw text', async () => {
      // Given a feedback closed as valid
      const feedback = aFeedback();
      feedback.applyAnalysis({
        verdict: 'valid',
        maskedText: 'maskeli metin',
        analyzedAt: after(0, 2),
      });

      // When it is saved and loaded
      await save(feedback);
      const loaded = await harness.feedbacks.find(feedbackId(1));

      // Then the state is the same, and the raw text is still the ciphertext
      expect(stateOf(loaded)).toEqual(stateOf(feedback));
      expect(loaded?.rawText).toMatchObject(RAW_TEXT);
    });

    it('keeps a feedback without raw text (after the retention job or a deletion request)', async () => {
      // Given the stored state of a feedback whose raw text was deleted
      const source = aFeedback();
      const withoutRawText = Feedback.reconstitute(
        {
          ...(stateOf(source) as NonNullable<ReturnType<typeof stateOf>>),
          rawText: null,
        },
        0,
      );

      // When it is saved and loaded
      await save(withoutRawText);

      // Then there is no raw text
      expect((await harness.feedbacks.find(feedbackId(1)))?.rawText).toBeNull();
    });

    it('finds a feedback by its user and Idempotency-Key, and only for that user (FR-AI-10)', async () => {
      // Given a stored feedback
      await save(aFeedback());

      // Then the same user and key find it; another key or another user do not
      const found = await harness.feedbacks.findByIdempotencyKey(
        FEEDBACK_USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(found?.id).toBe(feedbackId(1));
      expect(
        await harness.feedbacks.findByIdempotencyKey(
          FEEDBACK_USER_ID,
          OTHER_IDEMPOTENCY_KEY,
        ),
      ).toBeUndefined();
      expect(
        await harness.feedbacks.findByIdempotencyKey(
          'a0000000-0000-4000-8000-0000000000f2' as typeof FEEDBACK_USER_ID,
          IDEMPOTENCY_KEY,
        ),
      ).toBeUndefined();
    });

    it('lets two users use the same Idempotency-Key', async () => {
      await save(aFeedback());

      await save(
        aFeedback({
          id: feedbackId(2),
          userId:
            'a0000000-0000-4000-8000-0000000000f2' as typeof FEEDBACK_USER_ID,
        }),
      );

      expect((await harness.feedbacks.find(feedbackId(2)))?.version).toBe(1);
    });

    it('refuses a second feedback with the same user and Idempotency-Key, as an infrastructure error and without storing it', async () => {
      // Given a stored feedback
      await save(aFeedback());

      // When another feedback of the same user reuses its key
      const run = save(aFeedback({ id: feedbackId(2) }));

      // Then it fails, not as a concurrency conflict, and nothing was stored
      await expect(run).rejects.toThrow('feedbacks_user_idempotency_key_uq');
      await expect(run).rejects.not.toBeInstanceOf(ConcurrencyConflictError);
      expect(await harness.feedbacks.find(feedbackId(2))).toBeUndefined();
    });

    it('writes FeedbackSubmitted to the outbox in the same unit of work (ADR-005)', async () => {
      // When a new feedback is saved
      await save(aFeedback());

      // Then its event waits for the queue, once, with the right key
      const records = await harness.outbox();
      expect(records.map((r) => [r.eventType, r.aggregateId])).toEqual([
        ['FeedbackSubmitted', feedbackId(1)],
      ]);
    });

    it('writes nothing to the outbox when the unit of work rolls back', async () => {
      // Given a save inside a unit of work that then fails
      const run = harness.uow.run(async () => {
        await harness.feedbacks.save(aFeedback());
        throw new Error('fails after saving');
      });

      // Then neither the feedback nor its event remains
      await expect(run).rejects.toThrow('fails after saving');
      expect(await harness.feedbacks.find(feedbackId(1))).toBeUndefined();
      expect(await harness.outbox()).toEqual([]);
    });

    it('does not let a loaded feedback change the stored one (rows are plain copies)', async () => {
      // Given a stored feedback and a loaded copy that is changed without saving
      await save(aFeedback());
      const copy = await harness.feedbacks.find(feedbackId(1));
      copy?.applyAnalysis({
        verdict: 'spam',
        maskedText: 'x',
        analyzedAt: T0,
      });

      // Then the stored feedback is still analyzing
      expect((await harness.feedbacks.find(feedbackId(1)))?.status).toBe(
        'analyzing',
      );
    });
  });
}
