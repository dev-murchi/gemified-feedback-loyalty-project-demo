import type { FeedbackId, UserId } from '../../../../shared-kernel/ids.js';
import type { Feedback } from '../../domain/feedback/feedback.js';
import type { IdempotencyKey } from '../../domain/idempotency-key.js';

export interface FeedbackRepository {
  find(id: FeedbackId): Promise<Feedback | undefined>;
  /** The feedback this user already sent with this key, for the idempotent replay (FR-AI-10). */
  findByIdempotencyKey(
    userId: UserId,
    key: IdempotencyKey,
  ): Promise<Feedback | undefined>;
  /**
   * Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version. The
   * unique pair (user, Idempotency-Key) is the last line of defence: a second feedback with a
   * taken pair is an infrastructure error, not a conflict (docs/07 §6). Inside a unit of work.
   */
  save(feedback: Feedback): Promise<void>;
}
