import type { OutboxRecord } from '../outbox-record.js';
import type { OutboxStore } from '../outbox-store.js';
import type { InMemoryTable } from './in-memory-table.js';

const oldestFirst = (a: OutboxRecord, b: OutboxRecord): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);

/** The outbox table the in-memory unit of work writes, as the relay reads and marks it. */
export class MemoryOutboxStore implements OutboxStore {
  constructor(private readonly table: InMemoryTable<string, OutboxRecord>) {}

  unpublished(limit: number): Promise<readonly OutboxRecord[]> {
    const records = this.table
      .values()
      .filter((record) => record.publishedAt === null)
      .sort(oldestFirst)
      .slice(0, limit);
    return Promise.resolve(records);
  }

  markPublished(id: string, at: Date): Promise<void> {
    return this.#update(id, (record) => ({
      ...record,
      publishedAt: new Date(at),
    }));
  }

  markFailed(id: string, reason: string): Promise<void> {
    return this.#update(id, (record) => ({
      ...record,
      attempts: record.attempts + 1,
      lastError: reason,
    }));
  }

  #update(
    id: string,
    change: (record: OutboxRecord) => OutboxRecord,
  ): Promise<void> {
    const record = this.table.get(id);
    if (record === undefined)
      return Promise.reject(new Error(`No outbox record ${id}`));
    this.table.set(id, change(record));
    return Promise.resolve();
  }
}
