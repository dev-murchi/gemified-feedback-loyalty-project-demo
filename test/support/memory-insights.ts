import {
  MemoryB2bClientRepository,
  type B2bClientRow,
} from '../../src/contexts/insights/adapters/outbound/memory-b2b-client.repository.js';
import type { B2bClientRepository } from '../../src/contexts/insights/application/ports/b2b-client-repository.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import type { UnitOfWork } from '../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from './fake-clock.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** Everything an Insights repository test needs; the PostgreSQL harness (S0-11) has the same shape. */
export interface InsightsHarness {
  readonly uow: UnitOfWork;
  readonly clients: B2bClientRepository;
  dispose(): Promise<void>;
}

export function memoryInsightsHarness(): Promise<InsightsHarness> {
  const table = new InMemoryTable<string, B2bClientRow>();
  const uow = new InMemoryUnitOfWork({
    routes: fixedRoutes({}),
    tables: [table],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  return Promise.resolve({
    uow,
    clients: new MemoryB2bClientRepository({ table, events: uow }),
    dispose: () => Promise.resolve(),
  });
}
