// Runs the wallet repository contract against the in-memory adapter. S0-11 adds the same calls
// with a PostgreSQL harness under test/integration/.

import { memoryGamificationHarness } from '../../support/memory-gamification.js';
import { walletLedgerProperty } from './wallet-ledger.property.js';
import { walletRepositoryContract } from './wallet-repository.contract.js';

describe('WalletRepository (in-memory)', () => {
  walletRepositoryContract(memoryGamificationHarness);
  walletLedgerProperty(memoryGamificationHarness);
});
