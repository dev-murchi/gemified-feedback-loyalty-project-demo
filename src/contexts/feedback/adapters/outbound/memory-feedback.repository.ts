import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import {
  asPromise,
  checkVersion,
  commitVersioned,
} from '../../../../shared-kernel/adapters/save-versioned.js';
import type {
  BranchId,
  FeedbackId,
  UserId,
} from '../../../../shared-kernel/ids.js';
import type { EventCollector } from '../../../../shared-kernel/unit-of-work.js';
import type { FeedbackRepository } from '../../application/ports/feedback-repository.js';
import { Feedback } from '../../domain/feedback/feedback.js';
import type { FeedbackStatus } from '../../domain/feedback/feedback-status.js';
import type { StoredRawText } from '../../domain/feedback/raw-text.js';
import type { IdempotencyKey } from '../../domain/idempotency-key.js';
import type { RequestFingerprint } from '../../domain/request-fingerprint.js';

/** Plain stored feedback with its raw text; mirrors FEEDBACKS + FEEDBACK_RAW_TEXTS (SDD 6.1). */
export interface FeedbackRow {
  readonly id: string;
  readonly userId: string;
  readonly branchId: string;
  readonly qrCodeId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly status: FeedbackStatus;
  readonly rewardEligible: boolean;
  readonly correlationId: string;
  readonly submittedAt: Date;
  readonly analyzedAt: Date | null;
  readonly maskedText: string | null;
  readonly rawText: StoredRawText | null;
  readonly version: number;
}

export interface MemoryFeedbackRepositoryDeps {
  readonly table: InMemoryTable<string, FeedbackRow>;
  readonly events: EventCollector;
}

const toFeedback = (row: FeedbackRow): Feedback =>
  Feedback.reconstitute(
    {
      id: row.id as FeedbackId,
      userId: row.userId as UserId,
      branchId: row.branchId as BranchId,
      qrCodeId: row.qrCodeId,
      idempotencyKey: row.idempotencyKey as IdempotencyKey,
      requestFingerprint: row.requestFingerprint as RequestFingerprint,
      status: row.status,
      rewardEligible: row.rewardEligible,
      correlationId: row.correlationId,
      submittedAt: row.submittedAt,
      analyzedAt: row.analyzedAt,
      maskedText: row.maskedText,
      rawText: row.rawText,
    },
    row.version,
  );

const toRow = (feedback: Feedback, version: number): FeedbackRow => ({
  id: feedback.id,
  userId: feedback.userId,
  branchId: feedback.branchId,
  qrCodeId: feedback.qrCodeId,
  idempotencyKey: feedback.idempotencyKey,
  requestFingerprint: feedback.requestFingerprint,
  status: feedback.status,
  rewardEligible: feedback.rewardEligible,
  correlationId: feedback.correlationId,
  submittedAt: feedback.submittedAt,
  analyzedAt: feedback.analyzedAt,
  maskedText: feedback.maskedText,
  rawText: feedback.rawText,
  version,
});

export class MemoryFeedbackRepository implements FeedbackRepository {
  constructor(private readonly deps: MemoryFeedbackRepositoryDeps) {}

  find(id: FeedbackId): Promise<Feedback | undefined> {
    const row = this.deps.table.get(id);
    return Promise.resolve(row === undefined ? undefined : toFeedback(row));
  }

  findByIdempotencyKey(
    userId: UserId,
    key: IdempotencyKey,
  ): Promise<Feedback | undefined> {
    const row = this.deps.table
      .values()
      .find(
        (candidate) =>
          candidate.userId === userId && candidate.idempotencyKey === key,
      );
    return Promise.resolve(row === undefined ? undefined : toFeedback(row));
  }

  findAnalyzingSubmittedAtOrBefore(
    cutoff: Date,
    limit: number,
  ): Promise<readonly FeedbackId[]> {
    const ids = this.deps.table
      .values()
      .filter(
        (row) =>
          row.status === 'analyzing' &&
          row.submittedAt.getTime() <= cutoff.getTime(),
      )
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
      .slice(0, limit)
      .map((row) => row.id as FeedbackId);
    return Promise.resolve(ids);
  }

  /** Version first, then the key constraint, then the write (docs/07 §6). */
  save(feedback: Feedback): Promise<void> {
    return asPromise(() => {
      const storedVersion = checkVersion(
        this.deps.table,
        feedback.id,
        feedback,
      );
      this.#assertKeyFree(feedback);
      commitVersioned(this.deps, feedback, {
        key: feedback.id,
        toRow: (version) => toRow(feedback, version),
        storedVersion,
      });
    });
  }

  /**
   * Emulates the unique pair (user, Idempotency-Key) of FEEDBACKS (FR-AI-10). A violation is an
   * infrastructure error, not a concurrency conflict (docs/07 §6): the use case's idempotency
   * lookup and the cooldown's version already catch every replay and race of one user and branch.
   */
  #assertKeyFree(feedback: Feedback): void {
    const taken = this.deps.table
      .values()
      .find(
        (row) =>
          row.id !== feedback.id &&
          row.userId === feedback.userId &&
          row.idempotencyKey === feedback.idempotencyKey,
      );
    if (taken !== undefined)
      throw new Error(
        'Unique constraint feedbacks_user_idempotency_key_uq violated',
      );
  }
}
