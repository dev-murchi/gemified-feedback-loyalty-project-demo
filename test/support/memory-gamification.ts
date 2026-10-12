import {
  MemoryWalletRepository,
  toLedgerEntry,
  type LedgerRow,
  type WalletRow,
} from '../../src/contexts/gamification/adapters/outbound/memory-wallet.repository.js';
import type { WalletRepository } from '../../src/contexts/gamification/application/ports/wallet-repository.js';
import type { LedgerEntry } from '../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { EventRouter } from '../../src/shared-kernel/adapters/event-router.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import type { UserId } from '../../src/shared-kernel/ids.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import type {
  EventCollector,
  UnitOfWork,
} from '../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from './fake-clock.js';
import { RecordingLogger } from './recording-logger.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** Everything a Gamification test needs; the PostgreSQL harness (S0-11) provides the same shape. */
export interface GamificationHarness {
  readonly uow: UnitOfWork;
  /** Lets a test publish events the way a repository save does. */
  readonly events: EventCollector;
  /** Not frozen: tests register the handlers they need after the repositories exist. */
  readonly router: EventRouter;
  readonly wallets: WalletRepository;
  readonly logger: RecordingLogger;
  /** The stored ledger of a user, in insertion order (inspection only, not part of the port). */
  ledgerOf(userId: UserId): Promise<readonly LedgerEntry[]>;
  dispose(): Promise<void>;
}

/** The wallet repository on fresh in-memory tables, with its own unit of work and event router. */
export function memoryGamificationHarness(): Promise<GamificationHarness> {
  const wallets = new InMemoryTable<string, WalletRow>();
  const ledger = new InMemoryTable<string, LedgerRow>();
  const logger = new RecordingLogger();
  const router = new EventRouter();
  const uow = new InMemoryUnitOfWork({
    routes: router,
    tables: [wallets, ledger],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  return Promise.resolve({
    uow,
    events: uow,
    router,
    wallets: new MemoryWalletRepository({
      wallets,
      ledger,
      events: uow,
      logger,
    }),
    logger,
    ledgerOf: (userId) =>
      Promise.resolve(
        ledger
          .values()
          .filter((row) => row.userId === userId)
          .map(toLedgerEntry),
      ),
    dispose: () => Promise.resolve(),
  });
}
