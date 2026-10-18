import type { OutboxRecord } from '../../shared-kernel/outbox-record.js';
import type {
  ClaimedOutboxRecord,
  OutboxLease,
  OutboxStore,
} from '../../shared-kernel/outbox-store.js';
import type { PgDatabase } from './pg-database.js';

interface OutboxRow {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_id: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly last_error: string | null;
  readonly created_at: Date;
  readonly published_at: Date | null;
  readonly claimed_until: Date | null;
}

const toRecord = (row: OutboxRow): OutboxRecord => ({
  id: row.id,
  eventType: row.event_type,
  aggregateId: row.aggregate_id,
  payload: row.payload,
  createdAt: row.created_at,
  attempts: row.attempts,
  lastError: row.last_error,
  publishedAt: row.published_at,
  claimedUntil: row.claimed_until,
});

/** The RETURNING row of a claim: its lease is the one the statement just set. */
const toClaimed = (row: OutboxRow): ClaimedOutboxRecord => ({
  ...toRecord(row),
  claimedUntil: row.claimed_until as Date,
});

const oldestFirst = (a: OutboxRecord, b: OutboxRecord): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

/**
 * Writes an outbox record in the current unit of work (PgUnitOfWork, ADR-005). Outside one it
 * throws and writes nothing: the event and the change that produced it commit together or not at all.
 */
export async function insertOutboxRecord(
  db: PgDatabase,
  record: OutboxRecord,
): Promise<void> {
  await db.queryInUnitOfWork(
    `INSERT INTO outbox (id, event_type, aggregate_id, payload, attempts, last_error, created_at, published_at, claimed_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.id,
      record.eventType,
      record.aggregateId,
      JSON.stringify(record.payload),
      record.attempts,
      record.lastError,
      record.createdAt,
      record.publishedAt,
      record.claimedUntil,
    ],
  );
}

/**
 * The OUTBOX table as the relay claims and marks it (SDD 6.1, 9.1). Every call is one statement in
 * its own short transaction; none runs inside a unit of work, because the relay calls the queue
 * between them and an external call never runs inside a transaction (docs/07 §5). A call made
 * inside one throws.
 *
 * `claim` picks the oldest claimable rows with `FOR UPDATE SKIP LOCKED`, so relays claiming at the
 * same moment take different rows, and sets their lease in the same statement. The row locks last
 * only for that statement; afterwards the lease keeps other relays away. A mark matches the record
 * only while its lease is still the one the relay was handed (`claimed_until = $2`, fencing): once
 * the lease has passed to another relay, the late mark updates no row.
 */
export class PgOutboxStore implements OutboxStore {
  constructor(private readonly db: PgDatabase) {}

  async claim(
    limit: number,
    at: Date,
    leaseMs: number,
  ): Promise<readonly ClaimedOutboxRecord[]> {
    const result = await this.db.queryOutsideUnitOfWork<OutboxRow>(
      `WITH picked AS (
         SELECT id FROM outbox
         WHERE published_at IS NULL AND (claimed_until IS NULL OR claimed_until <= $2)
         ORDER BY created_at, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
       UPDATE outbox SET claimed_until = $3
       FROM picked WHERE outbox.id = picked.id
       RETURNING outbox.id, event_type, aggregate_id, payload, attempts, last_error,
                 created_at, published_at, claimed_until`,
      [limit, at, new Date(at.getTime() + leaseMs)],
    );
    return result.rows.map(toClaimed).sort(oldestFirst);
  }

  markPublished(lease: OutboxLease, at: Date): Promise<boolean> {
    return this.#update(
      `UPDATE outbox SET published_at = $3, claimed_until = NULL
       WHERE id = $1 AND claimed_until = $2`,
      [lease.id, lease.claimedUntil, at],
    );
  }

  markFailed(lease: OutboxLease, reason: string): Promise<boolean> {
    return this.#update(
      `UPDATE outbox SET attempts = attempts + 1, last_error = $3, claimed_until = NULL
       WHERE id = $1 AND claimed_until = $2`,
      [lease.id, lease.claimedUntil, reason],
    );
  }

  async #update(text: string, values: readonly unknown[]): Promise<boolean> {
    const result = await this.db.queryOutsideUnitOfWork(text, values);
    return result.rowCount === 1;
  }
}
