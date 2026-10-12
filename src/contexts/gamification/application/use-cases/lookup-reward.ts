import type { FeedbackId, UserId } from '../../../../shared-kernel/ids.js';
import type { LevelPolicy } from '../../domain/level-policy.js';
import { LedgerKey } from '../../domain/wallet/ledger-entry.js';
import type {
  FeedbackReward,
  RewardLookup,
} from '../../public/reward-lookup.js';
import type { WalletRepository } from '../ports/wallet-repository.js';

export interface LookupRewardDeps {
  readonly wallets: WalletRepository;
  readonly levels: LevelPolicy;
}

/**
 * Implements RewardLookup from the reward's ledger entry: the level before is derived from
 * `xpTotalAfter − xpDelta`, the level after from `xpTotalAfter` (SDD 6.1). The entry never changes,
 * so neither does the answer. Clawbacks (FR-GAM-07) are not considered yet.
 */
export class LookupReward implements RewardLookup {
  constructor(private readonly deps: LookupRewardDeps) {}

  async rewardFor(
    userId: UserId,
    feedbackId: FeedbackId,
  ): Promise<FeedbackReward | undefined> {
    const entry = await this.deps.wallets.findLedgerEntry(
      userId,
      LedgerKey.reward(feedbackId),
    );
    if (entry === undefined) return undefined;
    const from = this.deps.levels.levelFor(entry.xpTotalAfter - entry.xpDelta);
    const to = this.deps.levels.levelFor(entry.xpTotalAfter);
    return {
      xp: entry.xpDelta,
      points: entry.pointsDelta,
      levelUp: to > from ? { from, to } : null,
    };
  }
}
