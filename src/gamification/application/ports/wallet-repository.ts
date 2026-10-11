import type { UserId } from '../../../shared-kernel/ids.js';
import type { LedgerKey } from '../../domain/wallet/ledger-entry.js';
import type { Wallet } from '../../domain/wallet/wallet.js';

export interface WalletRepository {
  /** The wallet without ledger knowledge: enough to read the balance, not to award. */
  findById(userId: UserId): Promise<Wallet | undefined>;
  /**
   * The wallet together with whether `key` is in its ledger, so the wallet can decide whether to
   * award (`reward:{feedbackId}`) or, later, claw back (`clawback:{feedbackId}`) (FR-GAM-04).
   */
  findWithLedgerKey(
    userId: UserId,
    key: LedgerKey,
  ): Promise<Wallet | undefined>;
  /**
   * Writes the wallet with an optimistic lock (ADR-019) and appends its new ledger entries in the
   * same step; entries are never changed afterwards (FR-GAM-03). Throws ConcurrencyConflictError on
   * a stale version or, as a backstop, on a ledger key that already exists (docs/07 §6). Must run
   * inside a unit of work.
   */
  save(wallet: Wallet): Promise<void>;
}
