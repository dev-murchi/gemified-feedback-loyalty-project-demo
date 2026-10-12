import type { BrandRow } from '../contexts/catalog/adapters/outbound/memory-brand.repository.js';
import type { BranchRow } from '../contexts/catalog/adapters/outbound/memory-branch.repository.js';
import type { UserRow } from '../contexts/identity/adapters/outbound/memory-user.repository.js';
import type { LabelSetRow } from '../contexts/catalog/adapters/outbound/memory-label-set.repository.js';
import type {
  LedgerRow,
  WalletRow,
} from '../contexts/gamification/adapters/outbound/memory-wallet.repository.js';
import { InMemoryTable } from '../shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../shared-kernel/adapters/in-memory-unit-of-work.js';
import { RandomIdGenerator } from '../shared-kernel/adapters/random-id-generator.js';
import { SystemClock } from '../shared-kernel/adapters/system-clock.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { EventRouting } from '../shared-kernel/event-routing.js';
import type { IdGenerator } from '../shared-kernel/id-generator.js';
import type { OutboxRecord } from '../shared-kernel/outbox-record.js';

export interface CatalogTables {
  readonly brands: InMemoryTable<string, BrandRow>;
  readonly branches: InMemoryTable<string, BranchRow>;
  readonly labelSets: InMemoryTable<string, LabelSetRow>;
}

export interface IdentityTables {
  readonly users: InMemoryTable<string, UserRow>;
}

export interface GamificationTables {
  readonly wallets: InMemoryTable<string, WalletRow>;
  readonly ledger: InMemoryTable<string, LedgerRow>;
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
  readonly gamification: GamificationTables;
  readonly identity: IdentityTables;
}

/**
 * `routes` is the application's EventRouter, created first and filled after wiring. The clock is the
 * application's (tests replace it).
 */
export function createInMemoryStore(
  routes: EventRouting,
  clock: Clock = new SystemClock(),
): InMemoryStore {
  const ids = new RandomIdGenerator();
  // `satisfies` keeps the literal types, so Object.values below is typed and every table of a
  // context automatically takes part in rollback.
  const catalog = {
    brands: new InMemoryTable<string, BrandRow>(),
    branches: new InMemoryTable<string, BranchRow>(),
    labelSets: new InMemoryTable<string, LabelSetRow>(),
  } satisfies CatalogTables;
  const gamification = {
    wallets: new InMemoryTable<string, WalletRow>(),
    ledger: new InMemoryTable<string, LedgerRow>(),
  } satisfies GamificationTables;
  const identity = {
    users: new InMemoryTable<string, UserRow>(),
  } satisfies IdentityTables;
  const uow = new InMemoryUnitOfWork({
    routes,
    tables: [
      ...Object.values(catalog),
      ...Object.values(gamification),
      ...Object.values(identity),
    ],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock,
    ids,
  });
  return { uow, clock, ids, catalog, gamification, identity };
}
