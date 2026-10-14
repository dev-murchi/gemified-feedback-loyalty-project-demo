import { Feedback } from '../../../src/contexts/feedback/domain/feedback/feedback.js';
import { takeRecordedEvents } from '../../support/aggregate-access.js';
import {
  after,
  aFeedback,
  aNewFeedback,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  feedbackId,
  FINGERPRINT,
  IDEMPOTENCY_KEY,
  RAW_TEXT,
  T0,
} from '../../support/feedback-builders.js';

const valid = (maskedText = 'Pompa çalışmıyordu, [TELEFON] arayın') => ({
  verdict: 'valid' as const,
  maskedText,
  analyzedAt: after(0, 2),
});

describe('Feedback', () => {
  describe('submit', () => {
    it('starts analyzing, never stored, without a verdict or a masked text', () => {
      // When a comment is accepted
      const feedback = aFeedback();

      // Then it waits for its analysis
      expect(feedback.status).toBe('analyzing');
      expect(feedback.version).toBe(0);
      expect(feedback.analyzedAt).toBeNull();
      expect(feedback.maskedText).toBeNull();
      expect(feedback.idempotencyKey).toBe(IDEMPOTENCY_KEY);
      expect(feedback.requestFingerprint).toBe(FINGERPRINT);
    });

    it('records FeedbackSubmitted with the branch, the sector and no comment text (ADR-020)', () => {
      // When a comment is accepted
      const feedback = aFeedback({ sector: 'coffee', correlationId: 'req-7' });

      // Then the one event starts the analysis and carries no text
      const events = takeRecordedEvents(feedback);
      expect(events).toEqual([
        {
          type: 'FeedbackSubmitted',
          aggregateId: feedbackId(1),
          occurredAt: T0,
          branchId: FEEDBACK_BRANCH_ID,
          sector: 'coffee',
          submittedAt: T0,
          correlationId: 'req-7',
        },
      ]);
    });

    it('keeps the encrypted raw text for two years from submission (FR-PRIV-03)', () => {
      const feedback = aFeedback();

      expect(feedback.rawText).toEqual({
        ...RAW_TEXT,
        retainUntil: new Date('2028-10-14T09:00:00.000Z'),
      });
    });

    it('fixes reward eligibility at submission (FR-QR-10)', () => {
      expect(aFeedback({ rewardEligible: false }).rewardEligible).toBe(false);
      expect(aFeedback({ rewardEligible: true }).rewardEligible).toBe(true);
    });

    it('does not change when the caller changes the dates it passed in', () => {
      // Given a submission time the caller keeps using
      const submittedAt = new Date(T0);
      const feedback = aFeedback({ submittedAt });

      // When the caller changes its date and the returned one
      submittedAt.setUTCFullYear(2030);
      feedback.submittedAt.setUTCFullYear(2031);

      // Then the feedback is unchanged
      expect(feedback.submittedAt).toEqual(T0);
    });
  });

  describe('applyAnalysis', () => {
    it('closes a valid feedback and records FeedbackValidated for the reward (FR-GAM-01)', () => {
      // Given a submitted feedback whose submit event was taken
      const feedback = aFeedback();
      takeRecordedEvents(feedback);

      // When a valid verdict is applied
      const outcome = feedback.applyAnalysis(valid());

      // Then it is valid, keeps the masked text and the time, and announces the validation
      expect(outcome).toBe('closed');
      expect(feedback.status).toBe('valid');
      expect(feedback.maskedText).toBe('Pompa çalışmıyordu, [TELEFON] arayın');
      expect(feedback.analyzedAt).toEqual(after(0, 2));
      expect(takeRecordedEvents(feedback)).toEqual([
        {
          type: 'FeedbackValidated',
          aggregateId: feedbackId(1),
          occurredAt: after(0, 2),
          userId: FEEDBACK_USER_ID,
          submittedAt: T0,
          rewardEligible: true,
        },
      ]);
    });

    it('announces a low-trust valid feedback with rewardEligible false (FR-AUTH-06)', () => {
      const feedback = aFeedback({ rewardEligible: false });
      takeRecordedEvents(feedback);

      feedback.applyAnalysis(valid());

      expect(takeRecordedEvents(feedback)).toMatchObject([
        { type: 'FeedbackValidated', rewardEligible: false },
      ]);
    });

    it('closes a spam feedback without any event: no reward, the attempt stays used (FR-QR-09)', () => {
      const feedback = aFeedback();
      takeRecordedEvents(feedback);

      const outcome = feedback.applyAnalysis({
        verdict: 'spam',
        maskedText: 'asdf asdf asdf asdf asdf',
        analyzedAt: after(0, 1),
      });

      expect(outcome).toBe('closed');
      expect(feedback.status).toBe('spam');
      expect(takeRecordedEvents(feedback)).toEqual([]);
    });

    it('ignores a second result, so a job that ran twice changes and announces nothing (TC-GAM-01)', () => {
      // Given a feedback closed as valid
      const feedback = aFeedback();
      feedback.applyAnalysis(valid('ilk metin'));
      takeRecordedEvents(feedback);

      // When another result arrives, even a different verdict
      const outcome = feedback.applyAnalysis({
        verdict: 'spam',
        maskedText: 'başka metin',
        analyzedAt: after(1),
      });

      // Then nothing changed
      expect(outcome).toBe('ignored');
      expect(feedback.status).toBe('valid');
      expect(feedback.maskedText).toBe('ilk metin');
      expect(feedback.analyzedAt).toEqual(after(0, 2));
      expect(takeRecordedEvents(feedback)).toEqual([]);
    });
  });

  describe('closeUnanalyzed (FR-AI-09)', () => {
    const closing = (rewardAllowed: boolean) => ({
      closedAt: after(24),
      maskedText: null,
      rewardAllowed,
    });

    it('closes as unanalyzed and lets the reward through when it is eligible and allowed (TC-AI-04)', () => {
      const feedback = aFeedback();
      takeRecordedEvents(feedback);

      const outcome = feedback.closeUnanalyzed(closing(true));

      expect(outcome).toBe('closed');
      expect(feedback.status).toBe('unanalyzed');
      expect(feedback.analyzedAt).toBeNull();
      expect(takeRecordedEvents(feedback)).toEqual([
        {
          type: 'FeedbackValidated',
          aggregateId: feedbackId(1),
          occurredAt: after(24),
          userId: FEEDBACK_USER_ID,
          submittedAt: T0,
          rewardEligible: true,
        },
      ]);
    });

    it('still announces the close, but without a reward, when the closing does not allow one (TC-AI-05, TC-AI-11)', () => {
      const feedback = aFeedback();
      takeRecordedEvents(feedback);

      feedback.closeUnanalyzed(closing(false));

      expect(feedback.status).toBe('unanalyzed');
      expect(takeRecordedEvents(feedback)).toMatchObject([
        { type: 'FeedbackValidated', rewardEligible: false },
      ]);
    });

    it('never rewards a feedback that was not eligible at submission, whatever the closing says (TC-AI-05)', () => {
      const feedback = aFeedback({ rewardEligible: false });
      takeRecordedEvents(feedback);

      feedback.closeUnanalyzed(closing(true));

      expect(takeRecordedEvents(feedback)).toMatchObject([
        { type: 'FeedbackValidated', rewardEligible: false },
      ]);
    });

    it('keeps the masked text when masking had finished', () => {
      const feedback = aFeedback();

      feedback.closeUnanalyzed({
        ...closing(true),
        maskedText: 'maskeli metin',
      });

      expect(feedback.maskedText).toBe('maskeli metin');
    });

    it('ignores a feedback that is already closed, in either order', () => {
      // Given a feedback closed by its analysis
      const analyzed = aFeedback();
      analyzed.applyAnalysis(valid());
      takeRecordedEvents(analyzed);

      // And one closed after 24 hours
      const closed = aFeedback();
      closed.closeUnanalyzed(closing(true));
      takeRecordedEvents(closed);

      // When the other kind of result arrives late
      expect(analyzed.closeUnanalyzed(closing(true))).toBe('ignored');
      expect(closed.applyAnalysis(valid())).toBe('ignored');

      // Then both keep their status and announce nothing
      expect(analyzed.status).toBe('valid');
      expect(closed.status).toBe('unanalyzed');
      expect(takeRecordedEvents(analyzed)).toEqual([]);
      expect(takeRecordedEvents(closed)).toEqual([]);
    });
  });

  describe('isOverdueAt (FR-AI-09)', () => {
    it('is due exactly 24 hours after submission while still analyzing', () => {
      const feedback = aFeedback();

      expect(feedback.isOverdueAt(after(23, 59))).toBe(false);
      expect(feedback.isOverdueAt(after(24))).toBe(true);
    });

    it('is never due once closed', () => {
      const feedback = aFeedback();
      feedback.applyAnalysis(valid());

      expect(feedback.isOverdueAt(after(48))).toBe(false);
    });
  });

  describe('reconstitute', () => {
    it('restores a stored feedback with its version and records no event', () => {
      // Given the state of a stored, closed feedback
      const source = aFeedback();
      source.applyAnalysis(valid());

      // When it is restored at version 3
      const restored = Feedback.reconstitute(
        {
          id: source.id,
          userId: source.userId,
          branchId: source.branchId,
          qrCodeId: source.qrCodeId,
          idempotencyKey: source.idempotencyKey,
          requestFingerprint: source.requestFingerprint,
          status: source.status,
          rewardEligible: source.rewardEligible,
          correlationId: source.correlationId,
          submittedAt: source.submittedAt,
          analyzedAt: source.analyzedAt,
          maskedText: source.maskedText,
          rawText: source.rawText,
        },
        3,
      );

      // Then it has the same state, the version, and nothing to publish
      expect(restored.status).toBe('valid');
      expect(restored.version).toBe(3);
      expect(takeRecordedEvents(restored)).toEqual([]);
      expect(aNewFeedback().id).toBe(restored.id);
    });
  });
});
