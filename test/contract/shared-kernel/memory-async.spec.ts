// Runs the JobQueue and OutboxStore contracts against the in-memory adapters. BullMQ (slice 4) and
// PostgreSQL (S0-11) run the same contracts.

import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { MemoryJobQueue } from '../../../src/shared-kernel/adapters/memory-job-queue.js';
import { MemoryOutboxStore } from '../../../src/shared-kernel/adapters/memory-outbox-store.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import { jobQueueContract } from '../support/job-queue.contract.js';
import { outboxStoreContract } from '../support/outbox-store.contract.js';

describe('JobQueue (in-memory)', () => {
  jobQueueContract(() => {
    const queue = new MemoryJobQueue();
    return Promise.resolve({
      queue,
      jobsOf: (name) => Promise.resolve(queue.jobsOf(name)),
      dispose: () => Promise.resolve(),
    });
  });
});

describe('OutboxStore (in-memory)', () => {
  outboxStoreContract(() => {
    const table = new InMemoryTable<string, OutboxRecord>();
    return Promise.resolve({
      outbox: new MemoryOutboxStore(table),
      add: (record) => Promise.resolve(table.set(record.id, record)),
      dispose: () => Promise.resolve(),
    });
  });
});
