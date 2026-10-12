import { takeNewLedgerEntries } from '../../src/contexts/gamification/domain/wallet/ledger-access.js';
import type { LedgerEntry } from '../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import type { Wallet } from '../../src/contexts/gamification/domain/wallet/wallet.js';

/** Takes a wallet's unsaved ledger entries in a test, the way the wallet repository does. */
export const takeUnsavedEntries = (wallet: Wallet): readonly LedgerEntry[] =>
  wallet[takeNewLedgerEntries]();
