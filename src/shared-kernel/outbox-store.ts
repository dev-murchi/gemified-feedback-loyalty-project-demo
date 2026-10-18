import type { OutboxRecord } from './outbox-record.js';

/** A record as `claim` returns it: the lease the claiming relay holds is always set. */
export interface ClaimedOutboxRecord extends OutboxRecord {
  readonly claimedUntil: Date;
}

/** What a relay presents to mark a record: the record and the lease it was handed. */
export type OutboxLease = Pick<ClaimedOutboxRecord, 'id' | 'claimedUntil'>;

/**
 * The relay's view of the transactional outbox (ADR-005): records written by units of work, claimed
 * for a while, and marked once the queue has accepted them.
 *
 * None of these calls takes part in a unit of work or holds a transaction or a lock after it
 * returns: the relay calls the queue between them, and an external call never runs inside a
 * transaction (docs/07 §5). What keeps two relays apart is the lease of `claim`.
 *
 * A mark carries the lease its relay was handed (fencing). A relay that was slow may find its lease
 * ended and the record claimed, even marked, by another relay; its late mark must not touch that
 * relay's work, so a mark changes the record only while the lease it presents is still the record's.
 */
export interface OutboxStore {
  /**
   * Claims up to `limit` unpublished records, oldest first, for `leaseMs` from `at`. Until the lease
   * ends no other claim returns them. A record whose lease has ended, because its relay died or was
   * slow, is claimed again: handing it over twice is harmless (the outbox id is the job id).
   */
  claim(
    limit: number,
    at: Date,
    leaseMs: number,
  ): Promise<readonly ClaimedOutboxRecord[]>;
  /**
   * Marks the record published and releases the lease. Returns false, and changes nothing, when the
   * lease is no longer the one presented: the record now belongs to another relay (or does not
   * exist). That is no error.
   */
  markPublished(lease: OutboxLease, at: Date): Promise<boolean>;
  /**
   * Counts a failed hand-over, keeps its reason and releases the lease, so the next claim can retry
   * the record. Returns false, and changes nothing, when the lease is no longer the one presented.
   */
  markFailed(lease: OutboxLease, reason: string): Promise<boolean>;
}
