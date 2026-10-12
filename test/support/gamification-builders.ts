// Small builders for Gamification tests.

import { DEFAULT_REWARD_AMOUNTS } from '../../src/contexts/gamification/domain/reward-amounts.js';
import { LedgerKey } from '../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import {
  Wallet,
  type AwardOutcome,
  type RewardClaim,
  type RewardRules,
} from '../../src/contexts/gamification/domain/wallet/wallet.js';
import { retryOnConflict } from '../../src/shared-kernel/retry-on-conflict.js';
import type { FeedbackId, UserId } from '../../src/shared-kernel/ids.js';
import { FakeClock } from './fake-clock.js';
import type { GamificationHarness } from './memory-gamification.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

export const WALLET_USER_ID = 'a0000000-0000-4000-8000-000000000001' as UserId;
export const SUBMITTED_AT = new Date('2026-10-12T09:00:00.000Z');

/** Feedback ids f0000000-…-000000000001, …0002, … */
export const feedbackId = (n: number): FeedbackId =>
  `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}` as FeedbackId;

export const aClaim = (overrides: Partial<RewardClaim> = {}): RewardClaim => ({
  feedbackId: feedbackId(1),
  submittedAt: SUBMITTED_AT,
  rewardEligible: true,
  ...overrides,
});

export const rewardRules = (): RewardRules => ({
  amounts: DEFAULT_REWARD_AMOUNTS,
  ids: new SequentialIdGenerator(),
  clock: new FakeClock(new Date('2026-10-12T09:00:05.000Z')),
});

/** Stores a freshly opened wallet for WALLET_USER_ID. */
export const storeOpenWallet = (harness: GamificationHarness): Promise<void> =>
  harness.uow.run(() => harness.wallets.save(Wallet.open(WALLET_USER_ID)));

/**
 * Awards a claim the way the AwardReward use case will: load with the ledger key, decide, save only
 * when something changed, all in one unit of work that is retried once on a conflict.
 */
export function awardThroughPort(
  harness: GamificationHarness,
  claim: RewardClaim,
  rules: RewardRules = rewardRules(),
): Promise<AwardOutcome['outcome']> {
  return retryOnConflict(() =>
    harness.uow.run(async () => {
      const key = LedgerKey.reward(claim.feedbackId);
      const wallet = await harness.wallets.findWithLedgerKey(
        WALLET_USER_ID,
        key,
      );
      if (wallet === undefined) throw new Error('wallet is not stored');
      const result = wallet.award(claim, rules);
      if (result.outcome === 'awarded') await harness.wallets.save(wallet);
      return result.outcome;
    }),
  );
}
