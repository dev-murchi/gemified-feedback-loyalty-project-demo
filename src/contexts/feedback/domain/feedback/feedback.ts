import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type {
  BranchId,
  FeedbackId,
  UserId,
} from '../../../../shared-kernel/ids.js';
import type { FeedbackSubmitted } from '../events/feedback-submitted.js';
import type { FeedbackValidated } from '../events/feedback-validated.js';
import type { IdempotencyKey } from '../idempotency-key.js';
import type { RequestFingerprint } from '../request-fingerprint.js';
import type { FeedbackStatus } from './feedback-status.js';
import {
  rawTextRetainUntil,
  type EncryptedRawText,
  type StoredRawText,
} from './raw-text.js';

export type FeedbackEvent = FeedbackSubmitted | FeedbackValidated;

export interface FeedbackState {
  readonly id: FeedbackId;
  readonly userId: UserId;
  readonly branchId: BranchId;
  readonly idempotencyKey: IdempotencyKey;
  readonly requestFingerprint: RequestFingerprint;
  readonly status: FeedbackStatus;
  /** Decided at submission and never changed (FR-QR-10); false means no reward, whatever the verdict. */
  readonly rewardEligible: boolean;
  readonly correlationId: string;
  readonly submittedAt: Date;
  /** When the verdict was applied; null while analyzing and for an unanalyzed feedback. */
  readonly analyzedAt: Date | null;
  /** The comment with personal data masked; the only text brands see. Null until analyzed. */
  readonly maskedText: string | null;
  /** Null once the retention job or a deletion request removed it (FR-PRIV-02, FR-PRIV-03). */
  readonly rawText: StoredRawText | null;
}

export interface NewFeedback {
  readonly id: FeedbackId;
  readonly userId: UserId;
  readonly branchId: BranchId;
  /** The branch's sector; Analysis picks the topic list from it. */
  readonly sector: string;
  readonly idempotencyKey: IdempotencyKey;
  readonly requestFingerprint: RequestFingerprint;
  readonly rewardEligible: boolean;
  readonly correlationId: string;
  readonly submittedAt: Date;
  readonly rawText: EncryptedRawText;
}

/** The verdict of a finished analysis (the content of `FeedbackAnalyzed`). */
export interface AnalysisVerdict {
  readonly verdict: 'valid' | 'spam';
  readonly maskedText: string;
  readonly analyzedAt: Date;
}

/** A feedback that could not be analyzed in 24 hours (FR-AI-09). */
export interface UnanalyzedClosing {
  readonly closedAt: Date;
  /** The masked text, if masking got that far. */
  readonly maskedText: string | null;
  /** Budget guard off and the last failure was the provider being unreachable (SRS CR-007). */
  readonly rewardAllowed: boolean;
}

/** `ignored`: the feedback was already closed, so nothing changed and nothing needs saving. */
export type Closing = 'closed' | 'ignored';

const copyOrNull = (date: Date | null): Date | null =>
  date === null ? null : new Date(date);

const copyRawText = (raw: StoredRawText | null): StoredRawText | null =>
  raw === null ? null : { ...raw, retainUntil: new Date(raw.retainUntil) };

/**
 * One comment a customer sent (docs/06 §5.3). It starts `analyzing` and leaves that status once:
 * to `valid` or `spam` with the analysis verdict, or to `unanalyzed` after 24 hours. A second
 * result, from a job that ran twice, changes nothing. Whether it can earn a reward is fixed at
 * submission; the reward rules themselves live in RewardCooldown.
 */
export class Feedback extends AggregateRoot<FeedbackEvent> {
  #state: FeedbackState;

  private constructor(state: FeedbackState, version: number) {
    super(version);
    this.#state = {
      ...state,
      submittedAt: new Date(state.submittedAt),
      analyzedAt: copyOrNull(state.analyzedAt),
      rawText: copyRawText(state.rawText),
    };
  }

  /** A comment accepted now. Records FeedbackSubmitted, the event that starts the analysis. */
  static submit(input: NewFeedback): Feedback {
    const feedback = new Feedback(
      {
        id: input.id,
        userId: input.userId,
        branchId: input.branchId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        status: 'analyzing',
        rewardEligible: input.rewardEligible,
        correlationId: input.correlationId,
        submittedAt: input.submittedAt,
        analyzedAt: null,
        maskedText: null,
        rawText: {
          ...input.rawText,
          retainUntil: rawTextRetainUntil(input.submittedAt),
        },
      },
      0,
    );
    feedback.recordEvent({
      type: 'FeedbackSubmitted',
      aggregateId: input.id,
      occurredAt: new Date(input.submittedAt),
      branchId: input.branchId,
      sector: input.sector,
      submittedAt: new Date(input.submittedAt),
      correlationId: input.correlationId,
    });
    return feedback;
  }

  /** Restores stored state; version 0 means never stored. */
  static reconstitute(state: FeedbackState, version: number): Feedback {
    return new Feedback(state, version);
  }

  get id(): FeedbackId {
    return this.#state.id;
  }

  get userId(): UserId {
    return this.#state.userId;
  }

  get branchId(): BranchId {
    return this.#state.branchId;
  }

  get idempotencyKey(): IdempotencyKey {
    return this.#state.idempotencyKey;
  }

  get requestFingerprint(): RequestFingerprint {
    return this.#state.requestFingerprint;
  }

  get status(): FeedbackStatus {
    return this.#state.status;
  }

  get rewardEligible(): boolean {
    return this.#state.rewardEligible;
  }

  get correlationId(): string {
    return this.#state.correlationId;
  }

  get submittedAt(): Date {
    return new Date(this.#state.submittedAt);
  }

  get analyzedAt(): Date | null {
    return copyOrNull(this.#state.analyzedAt);
  }

  get maskedText(): string | null {
    return this.#state.maskedText;
  }

  get rawText(): StoredRawText | null {
    return copyRawText(this.#state.rawText);
  }

  /**
   * Applies the analysis verdict once. A valid feedback records FeedbackValidated, so Gamification
   * rewards it in the same unit of work (it carries `rewardEligible`, false for low trust); spam
   * records nothing. Applying a result to a closed feedback is harmless (`ignored`).
   */
  applyAnalysis(result: AnalysisVerdict): Closing {
    if (this.#state.status !== 'analyzing') return 'ignored';
    this.#state = {
      ...this.#state,
      status: result.verdict,
      maskedText: result.maskedText,
      analyzedAt: new Date(result.analyzedAt),
    };
    if (result.verdict === 'valid')
      this.#recordValidated(result.analyzedAt, this.#state.rewardEligible);
    return 'closed';
  }

  /**
   * Closes a feedback that is still `analyzing` after 24 hours as `unanalyzed` (FR-AI-09). It
   * always records FeedbackValidated; the reward is allowed only if the feedback was eligible at
   * submission and `rewardAllowed` is true.
   */
  closeUnanalyzed(closing: UnanalyzedClosing): Closing {
    if (this.#state.status !== 'analyzing') return 'ignored';
    this.#state = {
      ...this.#state,
      status: 'unanalyzed',
      maskedText: closing.maskedText,
    };
    this.#recordValidated(
      closing.closedAt,
      this.#state.rewardEligible && closing.rewardAllowed,
    );
    return 'closed';
  }

  #recordValidated(occurredAt: Date, rewardEligible: boolean): void {
    this.recordEvent({
      type: 'FeedbackValidated',
      aggregateId: this.#state.id,
      occurredAt: new Date(occurredAt),
      userId: this.#state.userId,
      submittedAt: new Date(this.#state.submittedAt),
      rewardEligible,
    });
  }
}
