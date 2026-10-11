import type { FeedbackValidated } from '../../../feedback/public/feedback-validated.js';
import type { EventHandler } from '../../../shared-kernel/event-routing.js';
import { LedgerKey } from '../../domain/wallet/ledger-entry.js';
import type { RewardRules } from '../../domain/wallet/wallet.js';
import type { WalletRepository } from '../ports/wallet-repository.js';

export interface AwardRewardDeps {
  readonly wallets: WalletRepository;
  readonly rules: RewardRules;
}

/**
 * Handles FeedbackValidated (FR-GAM-01, FR-GAM-04): loads the wallet together with the reward key,
 * lets the wallet decide, and saves only when something was awarded. "Already awarded" and "not
 * eligible" write nothing. Runs inside the publisher's unit of work and never retries itself; a
 * conflict rolls the whole unit of work back and the publisher's retryOnConflict reruns it.
 */
export class AwardReward implements EventHandler<FeedbackValidated> {
  constructor(private readonly deps: AwardRewardDeps) {}

  async handle(event: FeedbackValidated): Promise<void> {
    const key = LedgerKey.reward(event.aggregateId);
    const wallet = await this.deps.wallets.findWithLedgerKey(event.userId, key);
    if (wallet === undefined)
      throw new Error(`User ${event.userId} has no wallet`);
    const result = wallet.award(
      {
        feedbackId: event.aggregateId,
        submittedAt: event.submittedAt,
        rewardEligible: event.rewardEligible,
      },
      this.deps.rules,
    );
    if (result.outcome === 'awarded') await this.deps.wallets.save(wallet);
  }
}
