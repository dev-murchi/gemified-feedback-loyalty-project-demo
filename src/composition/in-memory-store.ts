import type { FeedbackAnalysisRow } from '../contexts/analysis/adapters/outbound/memory-feedback-analysis.repository.js';
import type { AuditRow } from '../contexts/insights/adapters/outbound/memory-audit-log.js';
import type { B2bClientRow } from '../contexts/insights/adapters/outbound/memory-b2b-client.repository.js';
import type { BrandRow } from '../contexts/catalog/adapters/outbound/memory-brand.repository.js';
import type { BranchRow } from '../contexts/catalog/adapters/outbound/memory-branch.repository.js';
import type { FeedbackRow } from '../contexts/feedback/adapters/outbound/memory-feedback.repository.js';
import type { RewardCooldownRow } from '../contexts/feedback/adapters/outbound/memory-reward-cooldown.repository.js';
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

export interface FeedbackTables {
  readonly feedbacks: InMemoryTable<string, FeedbackRow>;
  readonly cooldowns: InMemoryTable<string, RewardCooldownRow>;
}

export interface AnalysisTables {
  readonly analyses: InMemoryTable<string, FeedbackAnalysisRow>;
}

export interface InsightsTables {
  readonly b2bClients: InMemoryTable<string, B2bClientRow>;
  readonly auditLog: InMemoryTable<string, AuditRow>;
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
  readonly feedback: FeedbackTables;
  readonly analysis: AnalysisTables;
  readonly insights: InsightsTables;
  readonly gamification: GamificationTables;
  readonly identity: IdentityTables;
}

/** Every context's tables, one store per context. */
type ContextTables = Pick<
  InMemoryStore,
  'catalog' | 'feedback' | 'analysis' | 'insights' | 'gamification' | 'identity'
>;

// `satisfies` keeps the literal types, so Object.values in createInMemoryStore is typed and every
// table of a context automatically takes part in rollback.
const createTables = (): ContextTables => ({
  catalog: {
    brands: new InMemoryTable<string, BrandRow>(),
    branches: new InMemoryTable<string, BranchRow>(),
    labelSets: new InMemoryTable<string, LabelSetRow>(),
  } satisfies CatalogTables,
  feedback: {
    feedbacks: new InMemoryTable<string, FeedbackRow>(),
    cooldowns: new InMemoryTable<string, RewardCooldownRow>(),
  } satisfies FeedbackTables,
  analysis: {
    analyses: new InMemoryTable<string, FeedbackAnalysisRow>(),
  } satisfies AnalysisTables,
  insights: {
    b2bClients: new InMemoryTable<string, B2bClientRow>(),
    auditLog: new InMemoryTable<string, AuditRow>(),
  } satisfies InsightsTables,
  gamification: {
    wallets: new InMemoryTable<string, WalletRow>(),
    ledger: new InMemoryTable<string, LedgerRow>(),
  } satisfies GamificationTables,
  identity: {
    users: new InMemoryTable<string, UserRow>(),
  } satisfies IdentityTables,
});

/**
 * `routes` is the application's EventRouter, created first and filled after wiring. The clock is the
 * application's (tests replace it).
 */
export function createInMemoryStore(
  routes: EventRouting,
  clock: Clock = new SystemClock(),
): InMemoryStore {
  const ids = new RandomIdGenerator();
  const tables = createTables();
  const uow = new InMemoryUnitOfWork({
    routes,
    tables: Object.values(tables).flatMap((context: object) =>
      Object.values(context as Record<string, InMemoryTable<string, unknown>>),
    ),
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock,
    ids,
  });
  return { uow, clock, ids, ...tables };
}
