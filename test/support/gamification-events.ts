// Publishes the contract events in tests, the way Identity (S0-05) and Feedback (S0-07) will.

import type { FeedbackValidated } from '../../src/feedback/public/feedback-validated.js';
import { AwardReward } from '../../src/gamification/application/use-cases/award-reward.js';
import { OpenWallet } from '../../src/gamification/application/use-cases/open-wallet.js';
import type { WalletRepository } from '../../src/gamification/application/ports/wallet-repository.js';
import type { UserRegistered } from '../../src/identity/public/user-registered.js';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';
import type { UserId } from '../../src/shared-kernel/ids.js';
import { retryOnConflict } from '../../src/shared-kernel/retry-on-conflict.js';
import {
  feedbackId,
  rewardRules,
  SUBMITTED_AT,
  WALLET_USER_ID,
} from './gamification-builders.js';
import type { GamificationHarness } from './memory-gamification.js';

const OCCURRED_AT = new Date('2026-10-12T09:00:05.000Z');

export const userRegistered = (
  userId: UserId = WALLET_USER_ID,
): UserRegistered => ({
  type: 'UserRegistered',
  aggregateId: userId,
  occurredAt: OCCURRED_AT,
});

export const feedbackValidated = (
  n: number,
  overrides: Partial<Omit<FeedbackValidated, 'type' | 'aggregateId'>> = {},
): FeedbackValidated => ({
  type: 'FeedbackValidated',
  aggregateId: feedbackId(n),
  userId: WALLET_USER_ID,
  submittedAt: SUBMITTED_AT,
  rewardEligible: true,
  occurredAt: OCCURRED_AT,
  ...overrides,
});

/**
 * Registers OpenWallet and AwardReward on the harness router and freezes it, like
 * src/composition/event-routes.ts. `awardWallets` lets a test give AwardReward a scripted fake.
 */
export function wireGamification(
  harness: GamificationHarness,
  awardWallets: WalletRepository = harness.wallets,
): void {
  harness.router.register<UserRegistered>('UserRegistered', {
    sync: [new OpenWallet({ wallets: harness.wallets })],
  });
  harness.router.register<FeedbackValidated>('FeedbackValidated', {
    sync: [new AwardReward({ wallets: awardWallets, rules: rewardRules() })],
  });
  harness.router.freeze();
}

/** A publisher's unit of work that only publishes `event`, retried once on a conflict. */
export const publish = (
  harness: GamificationHarness,
  event: DomainEvent,
): Promise<void> =>
  retryOnConflict(() =>
    harness.uow.run(() => {
      harness.events.collect([event]);
      return Promise.resolve();
    }),
  );
