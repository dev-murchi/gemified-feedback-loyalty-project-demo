import {
  MemoryBrandRepository,
  type BrandRow,
} from '../../src/catalog/adapters/outbound/memory-brand.repository.js';
import {
  MemoryBranchRepository,
  type BranchRow,
} from '../../src/catalog/adapters/outbound/memory-branch.repository.js';
import {
  MemoryLabelSetRepository,
  type LabelSetRow,
} from '../../src/catalog/adapters/outbound/memory-label-set.repository.js';
import type { BranchRepository } from '../../src/catalog/application/ports/branch-repository.js';
import type { BrandRepository } from '../../src/catalog/application/ports/brand-repository.js';
import type { LabelSetRepository } from '../../src/catalog/application/ports/label-set-repository.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import type { UnitOfWork } from '../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from './fake-clock.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** Everything a Catalog test needs; the PostgreSQL harness (S0-11) provides the same shape. */
export interface CatalogHarness {
  readonly uow: UnitOfWork;
  readonly brands: BrandRepository;
  readonly branches: BranchRepository;
  readonly labelSets: LabelSetRepository;
  dispose(): Promise<void>;
}

/** Catalog repositories on fresh in-memory tables, sharing one in-memory unit of work. */
export function memoryCatalogHarness(): Promise<CatalogHarness> {
  const brands = new InMemoryTable<string, BrandRow>();
  const branches = new InMemoryTable<string, BranchRow>();
  const labelSets = new InMemoryTable<string, LabelSetRow>();
  const uow = new InMemoryUnitOfWork({
    routes: {},
    tables: [brands, branches, labelSets],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  return Promise.resolve({
    uow,
    brands: new MemoryBrandRepository({ table: brands, events: uow }),
    branches: new MemoryBranchRepository({ table: branches, events: uow }),
    labelSets: new MemoryLabelSetRepository({ table: labelSets, events: uow }),
    dispose: () => Promise.resolve(),
  });
}
