import type { BrandRow } from '../catalog/adapters/outbound/memory-brand.repository.js';
import type { BranchRow } from '../catalog/adapters/outbound/memory-branch.repository.js';
import type { LabelSetRow } from '../catalog/adapters/outbound/memory-label-set.repository.js';
import { InMemoryTable } from '../shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../shared-kernel/adapters/in-memory-unit-of-work.js';
import { RandomIdGenerator } from '../shared-kernel/adapters/random-id-generator.js';
import { SystemClock } from '../shared-kernel/adapters/system-clock.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { EventRoutes } from '../shared-kernel/event-routing.js';
import type { IdGenerator } from '../shared-kernel/id-generator.js';
import type { OutboxRecord } from '../shared-kernel/outbox-record.js';

export interface CatalogTables {
  readonly brands: InMemoryTable<string, BrandRow>;
  readonly branches: InMemoryTable<string, BranchRow>;
  readonly labelSets: InMemoryTable<string, LabelSetRow>;
}

/**
 * The in-memory "database" until PostgreSQL arrives (ADR-017, S0-11): every context's tables and
 * the one unit of work they share. Each context adds its tables here as it is built.
 */
export interface InMemoryStore {
  readonly uow: InMemoryUnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly catalog: CatalogTables;
}

export function createInMemoryStore(routes: EventRoutes = {}): InMemoryStore {
  const clock = new SystemClock();
  const ids = new RandomIdGenerator();
  const catalog: CatalogTables = {
    brands: new InMemoryTable(),
    branches: new InMemoryTable(),
    labelSets: new InMemoryTable(),
  };
  const uow = new InMemoryUnitOfWork({
    routes,
    tables: Object.values(catalog),
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock,
    ids,
  });
  return { uow, clock, ids, catalog };
}
