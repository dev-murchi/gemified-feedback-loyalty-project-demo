import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type { FeedbackAnalyzed } from '../events/feedback-analyzed.js';
import type { MaskedText } from '../masking/masked-text.js';
import type { RetryPolicy } from '../retry/retry-policy.js';
import type { AnalysisResult, FailureKind } from './analysis-result.js';

export interface FeedbackAnalysisState {
  readonly feedbackId: FeedbackId;
  readonly submittedAt: Date;
  /** Failed attempts so far. */
  readonly attempts: number;
  readonly nextAttemptAt: Date | null;
  readonly lastFailure: FailureKind | null;
  /** Kept from the first masking, so a 24-hour close can still show brands the masked text. */
  readonly maskedText: MaskedText | null;
  readonly result: AnalysisResult | null;
}

/** After a failure: try again at `retryAt`, or no time is left before the 24-hour deadline. */
export type RetryDecision =
  | { readonly next: 'retry'; readonly retryAt: Date }
  | { readonly next: 'deadline_passed' };

/** The 24-hour close's question (UnanalyzedReport): what is known, and may it be rewarded? */
export interface Findings {
  readonly maskedText: MaskedText | null;
  readonly rewardAllowed: boolean;
}

const copyResult = (result: AnalysisResult | null): AnalysisResult | null =>
  result === null
    ? null
    : { ...result, analyzedAt: new Date(result.analyzedAt) };

/**
 * The analysis of one feedback (docs/06 §5.4); its id is the feedback's id. It keeps the retry
 * state of failed attempts and, once, the result: completing records FeedbackAnalyzed, and a second
 * completion (a job that ran twice) changes nothing.
 */
export class FeedbackAnalysis extends AggregateRoot<FeedbackAnalyzed> {
  #state: FeedbackAnalysisState;

  private constructor(state: FeedbackAnalysisState, version: number) {
    super(version);
    this.#state = {
      ...state,
      submittedAt: new Date(state.submittedAt),
      nextAttemptAt:
        state.nextAttemptAt === null ? null : new Date(state.nextAttemptAt),
      result: copyResult(state.result),
    };
  }

  /** The analysis of a feedback before its first attempt. */
  static start(feedbackId: FeedbackId, submittedAt: Date): FeedbackAnalysis {
    return new FeedbackAnalysis(
      {
        feedbackId,
        submittedAt,
        attempts: 0,
        nextAttemptAt: null,
        lastFailure: null,
        maskedText: null,
        result: null,
      },
      0,
    );
  }

  static reconstitute(
    state: FeedbackAnalysisState,
    version: number,
  ): FeedbackAnalysis {
    return new FeedbackAnalysis(state, version);
  }

  get feedbackId(): FeedbackId {
    return this.#state.feedbackId;
  }

  get state(): FeedbackAnalysisState {
    return {
      ...this.#state,
      submittedAt: new Date(this.#state.submittedAt),
      nextAttemptAt:
        this.#state.nextAttemptAt === null
          ? null
          : new Date(this.#state.nextAttemptAt),
      result: copyResult(this.#state.result),
    };
  }

  get isCompleted(): boolean {
    return this.#state.result !== null;
  }

  /**
   * Records a failed attempt and when to try again (RetryPolicy, counted from submission). The
   * masked text is kept from the first attempt that got that far.
   */
  recordFailure(
    failure: {
      readonly kind: FailureKind;
      readonly at: Date;
      readonly maskedText: MaskedText | null;
    },
    policy: RetryPolicy,
  ): RetryDecision {
    const attempts = this.#state.attempts + 1;
    const retryAt = policy.nextAttemptAt(
      attempts,
      failure.at,
      this.#state.submittedAt,
    );
    this.#state = {
      ...this.#state,
      attempts,
      nextAttemptAt: retryAt,
      lastFailure: failure.kind,
      maskedText: this.#state.maskedText ?? failure.maskedText,
    };
    return retryAt === null
      ? { next: 'deadline_passed' }
      : { next: 'retry', retryAt: new Date(retryAt) };
  }

  /** Stores the result once and records FeedbackAnalyzed; `ignored` if a result is already stored. */
  complete(result: AnalysisResult): 'completed' | 'ignored' {
    if (this.isCompleted) return 'ignored';
    this.#state = {
      ...this.#state,
      result,
      maskedText: result.maskedText,
      nextAttemptAt: null,
    };
    this.recordEvent(this.#analyzedEvent(result));
    return 'completed';
  }

  /**
   * FR-AI-09: a reward is allowed only if the budget guard is off and the last failure was the
   * provider being unreachable; an off-schema answer never allows one (SRS CR-007, T-T6).
   */
  findings(budgetGuardOn: boolean): Findings {
    return {
      maskedText: this.#state.maskedText,
      rewardAllowed:
        !budgetGuardOn && this.#state.lastFailure === 'provider_unavailable',
    };
  }

  #analyzedEvent(result: AnalysisResult): FeedbackAnalyzed {
    const base = {
      type: 'FeedbackAnalyzed' as const,
      aggregateId: this.#state.feedbackId,
      occurredAt: new Date(result.analyzedAt),
      maskedText: result.maskedText,
      analyzedAt: new Date(result.analyzedAt),
    };
    if (result.source === 'pre_check')
      return { ...base, verdict: 'spam', sentiment: null, topicKey: null };
    return {
      ...base,
      verdict: result.verdict.isValid ? 'valid' : 'spam',
      sentiment: result.verdict.sentiment,
      topicKey: result.verdict.topicKey,
    };
  }
}
