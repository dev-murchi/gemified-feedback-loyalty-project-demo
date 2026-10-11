import type { InMemoryTable } from '../../../shared-kernel/adapters/in-memory-table.js';
import {
  asPromise,
  checkVersion,
  commitVersioned,
} from '../../../shared-kernel/adapters/save-versioned.js';
import { ConcurrencyConflictError } from '../../../shared-kernel/concurrency-conflict-error.js';
import type { FeedbackId, UserId } from '../../../shared-kernel/ids.js';
import type { Logger } from '../../../shared-kernel/logger.js';
import type { EventCollector } from '../../../shared-kernel/unit-of-work.js';
import type { WalletRepository } from '../../application/ports/wallet-repository.js';
import { takeNewLedgerEntries } from '../../domain/wallet/ledger-access.js';
import type {
  LedgerEntry,
  LedgerEntryId,
  LedgerEntryType,
  LedgerKey,
} from '../../domain/wallet/ledger-entry.js';
import { Wallet } from '../../domain/wallet/wallet.js';

/** Plain stored wallet; mirrors WALLETS (SDD 6.1). The level is derived from XP, not stored here. */
export interface WalletRow {
  readonly userId: string;
  readonly xp: number;
  readonly points: number;
  readonly version: number;
}

/** Plain stored ledger entry; mirrors LEDGER_ENTRIES (SDD 6.1). */
export interface LedgerRow {
  readonly id: string;
  readonly userId: string;
  readonly feedbackId: string;
  readonly key: string;
  readonly type: LedgerEntryType;
  readonly xpDelta: number;
  readonly pointsDelta: number;
  readonly xpTotalAfter: number;
  readonly earnedAt: Date;
  readonly createdAt: Date;
}

export interface MemoryWalletRepositoryDeps {
  readonly wallets: InMemoryTable<string, WalletRow>;
  /** Keyed by idempotency key: the unique constraint `ledger_entries_idempotency_key_uq`. */
  readonly ledger: InMemoryTable<string, LedgerRow>;
  readonly events: EventCollector;
  readonly logger: Logger;
}

const toWallet = (
  row: WalletRow,
  checks: Parameters<typeof Wallet.reconstitute>[2] = [],
) =>
  Wallet.reconstitute(
    { userId: row.userId as UserId, xp: row.xp, points: row.points },
    row.version,
    checks,
  );

export const toLedgerEntry = (row: LedgerRow): LedgerEntry => ({
  ...row,
  id: row.id as LedgerEntryId,
  userId: row.userId as UserId,
  feedbackId: row.feedbackId as FeedbackId,
  key: row.key as LedgerKey,
});

/**
 * In-memory wallets with an append-only ledger (ADR-017). There is no code path that changes or
 * deletes a ledger row (FR-GAM-03, T-T3).
 */
export class MemoryWalletRepository implements WalletRepository {
  constructor(private readonly deps: MemoryWalletRepositoryDeps) {}

  findById(userId: UserId): Promise<Wallet | undefined> {
    const row = this.deps.wallets.get(userId);
    return Promise.resolve(row === undefined ? undefined : toWallet(row));
  }

  findWithLedgerKey(
    userId: UserId,
    key: LedgerKey,
  ): Promise<Wallet | undefined> {
    const row = this.deps.wallets.get(userId);
    if (row === undefined) return Promise.resolve(undefined);
    const exists = this.deps.ledger.get(key) !== undefined;
    return Promise.resolve(toWallet(row, [{ key, exists }]));
  }

  /** Wallet version first, then the ledger keys, then all writes (docs/07 §6). */
  save(wallet: Wallet): Promise<void> {
    return asPromise(() => {
      const storedVersion = checkVersion(
        this.deps.wallets,
        wallet.userId,
        wallet,
      );
      const entries = wallet[takeNewLedgerEntries]();
      this.#assertKeysFree(entries);
      const walletStore = {
        table: this.deps.wallets,
        events: this.deps.events,
      };
      commitVersioned(walletStore, wallet, {
        ...this.#walletEntry(wallet),
        storedVersion,
      });
      for (const entry of entries)
        this.deps.ledger.set(entry.key, { ...entry });
    });
  }

  #walletEntry(wallet: Wallet) {
    return {
      key: wallet.userId,
      toRow: (version: number): WalletRow => ({
        userId: wallet.userId,
        xp: wallet.xp,
        points: wallet.points,
        version,
      }),
    };
  }

  /** Backstop for the unique ledger key: a concurrency symptom, logged and retried by the caller. */
  #assertKeysFree(entries: readonly LedgerEntry[]): void {
    const taken = entries.find(
      (entry) => this.deps.ledger.get(entry.key) !== undefined,
    );
    if (taken === undefined) return;
    this.deps.logger.warn(
      'Ledger idempotency key already exists; retrying the unit of work',
      {
        constraint: 'ledger_entries_idempotency_key_uq',
        key: taken.key,
      },
    );
    throw new ConcurrencyConflictError(taken.key);
  }
}
