import { GetWallet } from '../../../src/gamification/application/use-cases/get-wallet.js';
import { LookupReward } from '../../../src/gamification/application/use-cases/lookup-reward.js';
import { LevelPolicy } from '../../../src/gamification/domain/level-policy.js';
import type { UserId } from '../../../src/shared-kernel/ids.js';
import {
  aClaim,
  awardThroughPort,
  feedbackId,
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

const levels = new LevelPolicy();

/** Awards feedbacks 1..count. */
const awardFeedbacks = async (harness: GamificationHarness, count: number) => {
  for (let n = 1; n <= count; n += 1) {
    await awardThroughPort(harness, aClaim({ feedbackId: feedbackId(n) }));
  }
};

describe('GetWallet', () => {
  let harness: GamificationHarness;
  let getWallet: GetWallet;

  beforeEach(async () => {
    harness = await memoryGamificationHarness();
    wireGamification(harness);
    await publish(harness, userRegistered());
    getWallet = new GetWallet({ wallets: harness.wallets, levels });
  });

  it('shows a new wallet at level 1 with 100 XP to go (FR-AUTH-05)', async () => {
    // When a new wallet is read
    const view = await getWallet.execute({ userId: WALLET_USER_ID });

    // Then it matches the API contract's Wallet
    expect(view).toEqual({
      xp: 0,
      points: 0,
      level: 1,
      xpForNextLevel: 100,
      xpToNextLevel: 100,
    });
  });

  it('derives the level and the XP to the next level from total XP', async () => {
    // Given 12 rewarded feedbacks (120 XP, 60 points)
    await awardFeedbacks(harness, 12);

    // When the wallet is read
    const view = await getWallet.execute({ userId: WALLET_USER_ID });

    // Then it is level 2, needing 300 total XP for level 3 (the contract's example)
    expect(view).toEqual({
      xp: 120,
      points: 60,
      level: 2,
      xpForNextLevel: 300,
      xpToNextLevel: 180,
    });
  });

  it('fails for a user without a wallet', async () => {
    // When an unknown user's wallet is read
    const read = getWallet.execute({
      userId: 'a0000000-0000-4000-8000-0000000000ff' as UserId,
    });

    // Then it is an error
    await expect(read).rejects.toThrow();
  });
});

describe('LookupReward (RewardLookup)', () => {
  let harness: GamificationHarness;
  let lookup: LookupReward;

  beforeEach(async () => {
    harness = await memoryGamificationHarness();
    wireGamification(harness);
    await publish(harness, userRegistered());
    lookup = new LookupReward({ wallets: harness.wallets, levels });
  });

  it('finds nothing for a feedback that earned nothing', async () => {
    // When an unrewarded feedback is looked up
    const reward = await lookup.rewardFor(WALLET_USER_ID, feedbackId(1));

    // Then there is no reward
    expect(reward).toBeUndefined();
  });

  it('reports the reward without a level-up when the level stayed the same', async () => {
    // Given one rewarded feedback (0 → 10 XP)
    await awardFeedbacks(harness, 1);

    // When it is looked up
    const reward = await lookup.rewardFor(WALLET_USER_ID, feedbackId(1));

    // Then it earned 10/5 and caused no level-up
    expect(reward).toEqual({ xp: 10, points: 5, levelUp: null });
  });

  it('reports the level-up a reward caused, and keeps reporting it later (FR-GAM-05)', async () => {
    // Given the 10th reward crossed 100 XP (level 1 → 2), and more rewards followed
    await awardFeedbacks(harness, 15);

    // When the 10th and 11th feedbacks are looked up
    const crossing = await lookup.rewardFor(WALLET_USER_ID, feedbackId(10));
    const after = await lookup.rewardFor(WALLET_USER_ID, feedbackId(11));

    // Then only the 10th reports the level-up, unchanged by later rewards
    expect(crossing).toEqual({
      xp: 10,
      points: 5,
      levelUp: { from: 1, to: 2 },
    });
    expect(after?.levelUp).toBeNull();
  });
});
