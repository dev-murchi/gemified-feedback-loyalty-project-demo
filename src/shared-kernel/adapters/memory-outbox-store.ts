import type { OutboxRecord } from '../outbox-record.js';
import type {
  ClaimedOutboxRecord,
  OutboxLease,
  OutboxStore,
} from '../outbox-store.js';
import type { InMemoryTable } from './in-memory-table.js';

const oldestFirst = (a: OutboxRecord, b: OutboxRecord): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

const claimableAt =
  (at: Date) =>
  (record: OutboxRecord): boolean =>
    record.publishedAt === null &&
    (record.claimedUntil === null ||
      record.claimedUntil.getTime() <= at.getTime());

/** True while the record is still leased with exactly the lease the caller was handed. */
const holds = (record: OutboxRecord, lease: OutboxLease): boolean =>
  record.claimedUntil?.getTime() === lease.claimedUntil.getTime();

/** The outbox table the in-memory unit of work writes, as the relay claims and marks it. */
export class MemoryOutboxStore implements OutboxStore {
  constructor(private readonly table: InMemoryTable<string, OutboxRecord>) {}

  claim(
    limit: number,
    at: Date,
    leaseMs: number,
  ): Promise<readonly ClaimedOutboxRecord[]> {
    const claimedUntil = new Date(at.getTime() + leaseMs);
    const claimed = this.table
      .values()
      .filter(claimableAt(at))
      .sort(oldestFirst)
      .slice(0, limit)
      .map((record) => ({ ...record, claimedUntil }));
    claimed.forEach((record) => this.table.set(record.id, record));
    return Promise.resolve(claimed);
  }

  markPublished(lease: OutboxLease, at: Date): Promise<boolean> {
    return this.#update(lease, (record) => ({
      ...record,
      publishedAt: new Date(at),
      claimedUntil: null,
    }));
  }

  markFailed(lease: OutboxLease, reason: string): Promise<boolean> {
    return this.#update(lease, (record) => ({
      ...record,
      attempts: record.attempts + 1,
      lastError: reason,
      claimedUntil: null,
    }));
  }

  #update(
    lease: OutboxLease,
    change: (record: OutboxRecord) => OutboxRecord,
  ): Promise<boolean> {
    const record = this.table.get(lease.id);
    if (record === undefined || !holds(record, lease))
      return Promise.resolve(false);
    this.table.set(lease.id, change(record));
    return Promise.resolve(true);
  }
}
