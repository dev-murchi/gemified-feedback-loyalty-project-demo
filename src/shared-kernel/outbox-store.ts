import type { OutboxRecord } from './outbox-record.js';

/**
 * The relay's view of the transactional outbox (ADR-005): records written by units of work, read
 * oldest first, and marked once the queue has accepted them. Used outside any unit of work.
 */
export interface OutboxStore {
  /** Records not yet published, oldest first, at most `limit`. */
  unpublished(limit: number): Promise<readonly OutboxRecord[]>;
  markPublished(id: string, at: Date): Promise<void>;
  /** Counts a failed hand-over and keeps its reason; the record stays unpublished. */
  markFailed(id: string, reason: string): Promise<void>;
}
