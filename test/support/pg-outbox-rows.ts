import type { PgDatabase } from '../../src/platform/postgres/pg-database.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';

/** Every outbox record not yet published, claimed or not, oldest first: what tests look at. */
export async function waitingOutbox(
  db: PgDatabase,
): Promise<readonly OutboxRecord[]> {
  const { rows } = await db.query<OutboxRecord>(
    `SELECT id, event_type AS "eventType", aggregate_id AS "aggregateId", payload,
            attempts, last_error AS "lastError", created_at AS "createdAt",
            published_at AS "publishedAt", claimed_until AS "claimedUntil"
     FROM outbox WHERE published_at IS NULL ORDER BY created_at, id`,
  );
  return rows;
}
