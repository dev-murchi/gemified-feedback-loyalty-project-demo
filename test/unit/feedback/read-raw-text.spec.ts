import { ReadRawText } from '../../../src/contexts/feedback/application/use-cases/read-raw-text.js';
import type { FeedbackId } from '../../../src/shared-kernel/ids.js';
import { after } from '../../support/feedback-builders.js';
import {
  aSubmission,
  COMMENT,
  submissionFixture,
  type SubmissionFixture,
} from '../../support/submission-fixture.js';

describe('ReadRawText (RawTextSource)', () => {
  let fixture: SubmissionFixture;
  let source: ReadRawText;
  let id: FeedbackId;

  beforeEach(async () => {
    fixture = await submissionFixture();
    source = new ReadRawText({
      feedbacks: fixture.harness.feedbacks,
      cipher: fixture.cipher,
    });
    const submitted = await fixture.submit.execute(aSubmission());
    if (!submitted.ok) throw new Error('set-up submission was rejected');
    id = submitted.value.feedbackId;
  });

  it('gives Analysis the decrypted comment while the feedback is analyzing', async () => {
    expect(await source.rawTextFor(id)).toEqual({
      state: 'analyzing',
      text: COMMENT,
    });
  });

  it('gives nothing once the feedback is closed, so no LLM call is paid for', async () => {
    fixture.report.findings = { maskedText: null, rewardAllowed: false };
    fixture.clock.set(after(24));
    await fixture.finalize.execute({ feedbackId: id });

    expect(await source.rawTextFor(id)).toEqual({ state: 'not_analyzing' });
  });

  it('gives nothing for an unknown feedback', async () => {
    expect(
      await source.rawTextFor(
        'f0000000-0000-4000-8000-000000000999' as FeedbackId,
      ),
    ).toEqual({ state: 'not_analyzing' });
  });
});
