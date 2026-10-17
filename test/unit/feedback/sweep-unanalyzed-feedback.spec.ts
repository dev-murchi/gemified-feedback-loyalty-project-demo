import { SweepUnanalyzedFeedback } from '../../../src/contexts/feedback/application/use-cases/sweep-unanalyzed-feedback.js';
import type { FeedbackId } from '../../../src/shared-kernel/ids.js';
import {
  after,
  OTHER_IDEMPOTENCY_KEY,
} from '../../support/feedback-builders.js';
import { OTHER_QR_TOKEN } from '../../support/feedback-fakes.js';
import {
  aSubmission,
  bodyOf,
  COMMENT,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

describe('SweepUnanalyzedFeedback (FR-AI-09)', () => {
  let fixture: SubmissionFixture;
  let sweep: SweepUnanalyzedFeedback;
  let first: FeedbackId;
  let second: FeedbackId;

  const submitted = async (overrides = {}): Promise<FeedbackId> => {
    const result = await fixture.submit.execute(aSubmission(overrides));
    if (!result.ok)
      throw new Error(`set-up submission was rejected: ${result.error.code}`);
    return result.value.feedbackId;
  };

  const statusOf = async (id: FeedbackId) =>
    (await fixture.harness.feedbacks.find(id))?.status;

  beforeEach(async () => {
    // Given a feedback at T0 at one branch and another at 02:00 at a second branch
    fixture = await submissionFixture();
    sweep = new SweepUnanalyzedFeedback({
      feedbacks: fixture.harness.feedbacks,
      finalize: fixture.finalize,
      clock: fixture.clock,
    });
    first = await submitted();
    fixture.clock.set(after(2));
    second = await submitted({
      qrToken: OTHER_QR_TOKEN,
      idempotencyKey: OTHER_IDEMPOTENCY_KEY,
      body: bodyOf(COMMENT, OTHER_QR_TOKEN),
    });
  });

  it('closes only feedback still analyzing 24 hours after submission', async () => {
    fixture.clock.set(after(24, 30));

    expect(await sweep.execute()).toEqual({ closed: 1, failures: [] });

    expect(await statusOf(first)).toBe('unanalyzed');
    expect(await statusOf(second)).toBe('analyzing');
  });

  it('closes nothing more on the next sweep', async () => {
    fixture.clock.set(after(27));
    await sweep.execute();

    expect(await sweep.execute()).toEqual({ closed: 0, failures: [] });
  });

  it('reports a feedback it could not close and still closes the others; the next sweep retries it', async () => {
    // Given Analysis failing for the first feedback only
    const findings = fixture.report.findingsFor.bind(fixture.report);
    Object.assign(fixture.report, {
      findingsFor: (id: FeedbackId) =>
        id === first
          ? Promise.reject(new Error('analysis store down'))
          : findings(id),
    });
    fixture.clock.set(after(27));

    const report = await sweep.execute();

    expect(report).toEqual({
      closed: 1,
      failures: [{ feedbackId: first, error: 'Error: analysis store down' }],
    });
    expect(await statusOf(first)).toBe('analyzing');
    expect(await statusOf(second)).toBe('unanalyzed');
  });
});
