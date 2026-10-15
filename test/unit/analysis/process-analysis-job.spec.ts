import type { FeedbackId } from '../../../src/shared-kernel/ids.js';
import {
  analysisFixture,
  type AnalysisFixture,
} from '../../support/analysis-fixture.js';
import { after, T0 } from '../../support/feedback-builders.js';
import {
  answered,
  UNAVAILABLE,
} from '../../support/fake-sentiment-analyzer.js';
import { aSubmission } from '../../support/submission-fixture.js';

describe('ProcessAnalysisJob (docs/06 §5.4)', () => {
  let fixture: AnalysisFixture;
  let id: FeedbackId;

  const submitted = async (text?: string): Promise<FeedbackId> => {
    const result = await fixture.submit.execute(
      aSubmission(text === undefined ? {} : { text }),
    );
    if (!result.ok)
      throw new Error(`set-up submission was rejected: ${result.error.code}`);
    return result.value.feedbackId;
  };

  const runJob = (feedbackId = id) =>
    fixture.job.execute({ feedbackId, sector: 'fuel', submittedAt: T0 });

  const feedback = () => fixture.feedbacks.find(id);
  const analysis = () => fixture.analyses.find(id);

  beforeEach(async () => {
    fixture = analysisFixture();
    id = await submitted();
  });

  it('stores a valid result and rewards it in the same transaction (ADR-014)', async () => {
    expect(await runJob()).toEqual({ outcome: 'analyzed' });

    expect(await feedback()).toMatchObject({ status: 'valid' });
    expect(fixture.validated).toMatchObject([
      { aggregateId: id, rewardEligible: true },
    ]);
    expect((await analysis())?.state.result).toMatchObject({
      source: 'llm',
      verdict: { sentiment: 'angry', topicKey: 'pump', isValid: true },
      provenance: {
        model: 'fake-model',
        promptVersion: 'feedback-analysis/v1',
        labelSetVersion: 3,
      },
    });
  });

  it('sends the model only the masked comment and the sector’s topics (FR-AI-07, TC-AI-06)', async () => {
    fixture = analysisFixture();
    id = await submitted(
      'Pompa bozuktu, beni 0532 123 45 67 numarasından arayın.',
    );

    await runJob();

    expect(fixture.analyzer.requests).toEqual([
      {
        maskedText: 'Pompa bozuktu, beni [TELEFON] numarasından arayın.',
        topics: expect.arrayContaining([
          { key: 'pump', name: 'Pompa' },
        ]) as unknown,
      },
    ]);
    expect((await feedback())?.maskedText).toBe(
      'Pompa bozuktu, beni [TELEFON] numarasından arayın.',
    );
  });

  it('calls gibberish spam without the LLM, with no sentiment or topic (owner decision of S0-08)', async () => {
    fixture = analysisFixture();
    id = await submitted('aaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    expect(await runJob()).toEqual({ outcome: 'analyzed' });

    expect(fixture.analyzer.requests).toEqual([]);
    expect(await feedback()).toMatchObject({ status: 'spam' });
    expect((await analysis())?.state.result).toMatchObject({
      source: 'pre_check',
      spamReason: 'gibberish',
    });
    expect(fixture.validated).toEqual([]);
  });

  describe('failures and retries (FR-AI-05)', () => {
    it('keeps the feedback analyzing when the provider is unreachable, and retries in a minute (TC-AI-03)', async () => {
      fixture.analyzer.script = [UNAVAILABLE];

      expect(await runJob()).toEqual({ outcome: 'retry', at: after(0, 1) });

      expect(await feedback()).toMatchObject({ status: 'analyzing' });
      expect((await analysis())?.state).toMatchObject({
        attempts: 1,
        lastFailure: 'provider_unavailable',
      });
    });

    it('completes once the provider is back', async () => {
      fixture.analyzer.script = [UNAVAILABLE, answered()];
      await runJob();
      fixture.clock.set(after(0, 1));

      expect(await runJob()).toEqual({ outcome: 'analyzed' });
      expect(await feedback()).toMatchObject({ status: 'valid' });
    });

    it.each([
      ['an answer outside the schema (TC-AI-02)', { verdict: 'good' }],
      [
        'a topic outside the label set (FR-AI-04)',
        {
          sentiment: 'angry',
          topicKey: 'parking',
          isValid: true,
          spamReason: null,
        },
      ],
    ])('records %s as invalid_response and retries', async (_case, output) => {
      fixture.analyzer.script = [answered(output)];

      expect(await runJob()).toMatchObject({ outcome: 'retry' });

      expect((await analysis())?.state.lastFailure).toBe('invalid_response');
      expect(await feedback()).toMatchObject({ status: 'analyzing' });
    });

    it('stops when the next attempt would fall after submittedAt + 24 h', async () => {
      fixture.analyzer.script = [UNAVAILABLE];
      fixture.clock.set(after(23, 59));

      expect(await runJob()).toEqual({ outcome: 'deadline_passed' });
    });

    it('makes no attempt at all after submittedAt + 24 h', async () => {
      fixture.clock.set(after(24));

      expect(await runJob()).toEqual({ outcome: 'deadline_passed' });
      expect(fixture.analyzer.requests).toEqual([]);
    });
  });

  describe('no LLM call when there is nothing to analyze', () => {
    it('skips a feedback that is already analyzed (a duplicate job costs nothing)', async () => {
      await runJob();

      expect(await runJob()).toEqual({ outcome: 'skipped' });
      expect(fixture.analyzer.requests).toHaveLength(1);
      expect(fixture.validated).toHaveLength(1);
    });

    it('skips a feedback the 24-hour close already ended', async () => {
      fixture.analyzer.script = [UNAVAILABLE];
      await runJob();
      fixture.clock.set(after(24));
      await fixture.finalize.execute({ feedbackId: id });

      expect(
        await fixture.job.execute({
          feedbackId: id,
          sector: 'fuel',
          submittedAt: after(1),
        }),
      ).toEqual({
        outcome: 'skipped',
      });
      expect(fixture.analyzer.requests).toHaveLength(1);
    });

    it('lets only one of two concurrent jobs store a result and reward', async () => {
      const [first, second] = await Promise.all([runJob(), runJob()]);

      expect([first, second]).toEqual(
        expect.arrayContaining([
          { outcome: 'analyzed' },
          { outcome: 'skipped' },
        ]),
      );
      expect(fixture.validated).toHaveLength(1);
    });
  });

  describe('the 24-hour close after failed attempts (FR-AI-09, SRS CR-007)', () => {
    it('rewards when the provider was unreachable', async () => {
      fixture.analyzer.script = [UNAVAILABLE];
      await runJob();
      fixture.clock.set(after(24));

      await fixture.finalize.execute({ feedbackId: id });

      expect(fixture.validated).toMatchObject([
        { aggregateId: id, rewardEligible: true },
      ]);
      expect((await feedback())?.maskedText).not.toBeNull();
    });

    it('never rewards after an off-schema answer (T-T6, TC-AI-11)', async () => {
      fixture.analyzer.script = [answered({ verdict: 'good' })];
      await runJob();
      fixture.clock.set(after(24));

      await fixture.finalize.execute({ feedbackId: id });

      expect(fixture.validated).toMatchObject([
        { aggregateId: id, rewardEligible: false },
      ]);
    });
  });

  it('fails for a sector the queue should never deliver', async () => {
    const run = fixture.job.execute({
      feedbackId: id,
      sector: 'bakery',
      submittedAt: T0,
    });

    await expect(run).rejects.toThrow('Unknown sector "bakery"');
  });
});
