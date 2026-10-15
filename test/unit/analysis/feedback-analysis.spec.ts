import type { MaskedText } from '../../../src/contexts/analysis/domain/masking/masked-text.js';
import { RetryPolicy } from '../../../src/contexts/analysis/domain/retry/retry-policy.js';
import { takeRecordedEvents } from '../../support/aggregate-access.js';
import {
  anAnalysis,
  ANALYZED_ID,
  llmResult,
  MASKED,
  minutesAfter,
  preCheckResult,
} from '../../support/analysis-builders.js';

const policy = new RetryPolicy();

describe('FeedbackAnalysis', () => {
  describe('complete', () => {
    it('records FeedbackAnalyzed with the verdict, sentiment, topic and masked text', () => {
      const analysis = anAnalysis();

      expect(analysis.complete(llmResult(true, minutesAfter(1)))).toBe(
        'completed',
      );

      expect(takeRecordedEvents(analysis)).toEqual([
        {
          type: 'FeedbackAnalyzed',
          aggregateId: ANALYZED_ID,
          occurredAt: minutesAfter(1),
          verdict: 'valid',
          maskedText: MASKED,
          sentiment: 'angry',
          topicKey: 'pump',
          analyzedAt: minutesAfter(1),
        },
      ]);
    });

    it('announces an LLM answer with isValid false as spam', () => {
      const analysis = anAnalysis();

      analysis.complete(llmResult(false));

      expect(takeRecordedEvents(analysis)).toMatchObject([
        { verdict: 'spam', sentiment: 'angry' },
      ]);
    });

    it('announces pre-check spam without sentiment or topic (owner decision of S0-08)', () => {
      const analysis = anAnalysis();

      analysis.complete(preCheckResult());

      expect(takeRecordedEvents(analysis)).toMatchObject([
        { verdict: 'spam', sentiment: null, topicKey: null },
      ]);
      expect(analysis.state.result).toMatchObject({
        source: 'pre_check',
        spamReason: 'gibberish',
      });
    });

    it('stores the result once: a job that ran twice changes and announces nothing', () => {
      const analysis = anAnalysis();
      analysis.complete(llmResult(true, minutesAfter(1)));
      takeRecordedEvents(analysis);

      expect(analysis.complete(llmResult(false, minutesAfter(5)))).toBe(
        'ignored',
      );

      expect(analysis.state.result).toMatchObject({
        analyzedAt: minutesAfter(1),
      });
      expect(takeRecordedEvents(analysis)).toEqual([]);
    });

    it('records the model, prompt and label-set versions with an LLM result (FR-AI-11)', () => {
      const analysis = anAnalysis();

      analysis.complete(llmResult());

      expect(analysis.state.result).toMatchObject({
        provenance: {
          model: 'test-model',
          promptVersion: 'feedback-analysis/v1',
          labelSetVersion: 1,
        },
      });
    });
  });

  describe('recordFailure', () => {
    it('counts the attempt, keeps the failure kind and schedules the next one', () => {
      const analysis = anAnalysis();

      const decision = analysis.recordFailure(
        { kind: 'invalid_response', at: minutesAfter(0), maskedText: MASKED },
        policy,
      );

      expect(decision).toEqual({ next: 'retry', retryAt: minutesAfter(1) });
      expect(analysis.state).toMatchObject({
        attempts: 1,
        lastFailure: 'invalid_response',
        nextAttemptAt: minutesAfter(1),
        maskedText: MASKED,
      });
    });

    it('says when no time is left before the deadline', () => {
      const analysis = anAnalysis();

      const decision = analysis.recordFailure(
        {
          kind: 'provider_unavailable',
          at: minutesAfter(24 * 60 - 1),
          maskedText: MASKED,
        },
        policy,
      );

      expect(decision).toEqual({ next: 'deadline_passed' });
      expect(analysis.state.nextAttemptAt).toBeNull();
    });

    it('keeps the first masked text when a later attempt had none', () => {
      const analysis = anAnalysis();
      analysis.recordFailure(
        {
          kind: 'provider_unavailable',
          at: minutesAfter(0),
          maskedText: MASKED,
        },
        policy,
      );

      analysis.recordFailure(
        { kind: 'provider_unavailable', at: minutesAfter(1), maskedText: null },
        policy,
      );

      expect(analysis.state.maskedText).toBe(MASKED);
    });
  });

  describe('findings for the 24-hour close (FR-AI-09, SRS CR-007)', () => {
    const failedWith = (kind: 'provider_unavailable' | 'invalid_response') => {
      const analysis = anAnalysis();
      analysis.recordFailure(
        { kind, at: minutesAfter(0), maskedText: MASKED },
        policy,
      );
      return analysis;
    };

    it('allows a reward only when the provider was unreachable and the budget guard is off', () => {
      expect(failedWith('provider_unavailable').findings(false)).toEqual({
        maskedText: MASKED,
        rewardAllowed: true,
      });
    });

    it('never allows a reward after an off-schema answer (T-T6)', () => {
      expect(failedWith('invalid_response').findings(false).rewardAllowed).toBe(
        false,
      );
    });

    it('never allows a reward while the budget guard is on (FR-AI-12)', () => {
      expect(
        failedWith('provider_unavailable').findings(true).rewardAllowed,
      ).toBe(false);
    });

    it('allows none before any attempt failed', () => {
      expect(anAnalysis().findings(false)).toEqual({
        maskedText: null,
        rewardAllowed: false,
      });
    });
  });

  it('does not change when the caller changes a date it got', () => {
    const analysis = anAnalysis();
    analysis.recordFailure(
      {
        kind: 'provider_unavailable',
        at: minutesAfter(0),
        maskedText: 'x' as MaskedText,
      },
      policy,
    );

    analysis.state.nextAttemptAt?.setUTCFullYear(2030);
    analysis.state.submittedAt.setUTCFullYear(2030);

    expect(analysis.state.nextAttemptAt).toEqual(minutesAfter(1));
    expect(analysis.state.submittedAt).toEqual(minutesAfter(0));
  });
});
