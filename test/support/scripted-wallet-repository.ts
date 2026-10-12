import type { WalletRepository } from '../../src/contexts/gamification/application/ports/wallet-repository.js';
import type {
  LedgerEntry,
  LedgerKey,
} from '../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import { Wallet } from '../../src/contexts/gamification/domain/wallet/wallet.js';
import type { UserId } from '../../src/shared-kernel/ids.js';

/**
 * A WalletRepository fake around a real one, whose first findWithLedgerKey is scripted:
 * - 'stale': returns a copy captured earlier (captureStale), as if another award saved in between
 * - 'misled': returns the current wallet but claims the key is absent (the unique-key backstop)
 * Every later call is honest. Counts findWithLedgerKey calls.
 */
export class ScriptedWalletRepository implements WalletRepository {
  loads = 0;
  #stale: Wallet | undefined;

  constructor(
    private readonly inner: WalletRepository,
    private readonly script: 'stale' | 'misled',
  ) {}

  /** For 'stale': loads now the copy that the first findWithLedgerKey will return later. */
  async captureStale(userId: UserId, key: LedgerKey): Promise<void> {
    this.#stale = await this.inner.findWithLedgerKey(userId, key);
  }

  findById(userId: UserId): Promise<Wallet | undefined> {
    return this.inner.findById(userId);
  }

  async findWithLedgerKey(
    userId: UserId,
    key: LedgerKey,
  ): Promise<Wallet | undefined> {
    this.loads += 1;
    if (this.loads > 1) return this.inner.findWithLedgerKey(userId, key);
    return this.script === 'stale' ? this.#stale : this.#misled(userId, key);
  }

  save(wallet: Wallet): Promise<void> {
    return this.inner.save(wallet);
  }

  findLedgerEntry(
    userId: UserId,
    key: LedgerKey,
  ): Promise<LedgerEntry | undefined> {
    return this.inner.findLedgerEntry(userId, key);
  }

  async #misled(userId: UserId, key: LedgerKey): Promise<Wallet | undefined> {
    const current = await this.inner.findById(userId);
    if (current === undefined) return undefined;
    return Wallet.reconstitute(
      { userId, xp: current.xp, points: current.points },
      current.version,
      [{ key, exists: false }],
    );
  }
}
