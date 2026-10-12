import { LedgerKey } from '../../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import {
  aClaim,
  feedbackId,
  rewardRules,
  WALLET_USER_ID,
} from '../../support/gamification-builders.js';
import {
  publish,
  userRegistered,
  wireGamification,
} from '../../support/gamification-events.js';
import {
  memoryGamificationHarness,
  type GamificationHarness,
} from '../../support/memory-gamification.js';

describe('OpenWallet (UserRegistered)', () => {
  let harness: GamificationHarness;

  beforeEach(async () => {
    harness = await memoryGamificationHarness();
    wireGamification(harness);
  });

  it('opens an empty wallet for the new user (FR-AUTH-01, FR-AUTH-04)', async () => {
    // Given no wallet for the user
    // When UserRegistered is published
    await publish(harness, userRegistered());

    // Then the user has a stored wallet with 0 XP and 0 points
    const wallet = await harness.wallets.findById(WALLET_USER_ID);
    expect([wallet?.xp, wallet?.points, wallet?.version]).toEqual([0, 0, 1]);
  });

  it('refuses a second wallet for the same user, and the unit of work rolls back', async () => {
    // Given the user's wallet was opened
    await publish(harness, userRegistered());

    // When one unit of work saves an award and then publishes UserRegistered for the same user again
    const run = harness.uow.run(async () => {
      const key = LedgerKey.reward(feedbackId(1));
      const wallet = await harness.wallets.findWithLedgerKey(
        WALLET_USER_ID,
        key,
      );
      wallet?.award(aClaim(), rewardRules());
      if (wallet !== undefined) await harness.wallets.save(wallet);
      harness.events.collect([userRegistered()]);
    });

    // Then it is refused and the award saved earlier in that unit of work is undone too
    await expect(run).rejects.toThrow('already has a wallet');
    const wallet = await harness.wallets.findById(WALLET_USER_ID);
    expect([wallet?.xp, wallet?.version]).toEqual([0, 1]);
    expect(await harness.ledgerOf(WALLET_USER_ID)).toEqual([]);
  });
});
