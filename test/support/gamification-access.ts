import { takeNewLedgerEntries } from '../../src/gamification/domain/wallet/ledger-access.js';
import type { LedgerEntry } from '../../src/gamification/domain/wallet/ledger-entry.js';
import type { Wallet } from '../../src/gamification/domain/wallet/wallet.js';

/** Takes a wallet's unsaved ledger entries in a test, the way the wallet repository does. */
export const takeUnsavedEntries = (wallet: Wallet): readonly LedgerEntry[] =>
  wallet[takeNewLedgerEntries]();
