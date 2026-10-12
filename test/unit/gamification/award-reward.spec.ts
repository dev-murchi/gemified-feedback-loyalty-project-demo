import { LedgerKey } from '../../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import type { UserId } from '../../../src/shared-kernel/ids.js';
import {
  aClaim,
  awardThroughPort,
  feedbackId,
  WALLET_USER_ID,
} from '../../support/gamification-builders.js';
import {
  feedbackValidated,
  publish,
  userRegistered,
  wireGamification,
} from '../../support/gamification-events.js';
import {
  memoryGamificationHarness,
  type GamificationHarness,
} from '../../support/memory-gamification.js';
import { ScriptedWalletRepository } from '../../support/scripted-wallet-repository.js';

describe('AwardReward (FeedbackValidated)', () => {
  let harness: GamificationHarness;
  const stored = async () => {
    const wallet = await harness.wallets.findById(WALLET_USER_ID);
    const ledger = await harness.ledgerOf(WALLET_USER_ID);
    return { xp: wallet?.xp, points: wallet?.points, entries: ledger.length };
  };

  beforeEach(async () => {
    harness = await memoryGamificationHarness();
  });

  describe('with the real repository', () => {
    beforeEach(async () => {
      wireGamification(harness);
      await publish(harness, userRegistered());
    });

    it('awards 10 XP and 5 points for an eligible feedback (FR-GAM-01)', async () => {
      // When an eligible FeedbackValidated is published
      await publish(harness, feedbackValidated(1));

      // Then one reward is stored
      expect(await stored()).toEqual({ xp: 10, points: 5, entries: 1 });
    });

    it('awards once when the same FeedbackValidated is handled twice (TC-GAM-01)', async () => {
      // Given the feedback was already rewarded
      await publish(harness, feedbackValidated(1));
      const version = (await harness.wallets.findById(WALLET_USER_ID))?.version;

      // When the same event is handled again (e.g. the analysis job ran twice)
      await publish(harness, feedbackValidated(1));

      // Then one entry, one credit, and the wallet was not saved again
      expect(await stored()).toEqual({ xp: 10, points: 5, entries: 1 });
      expect((await harness.wallets.findById(WALLET_USER_ID))?.version).toBe(
        version,
      );
    });

    it('stores nothing for a feedback that is not reward-eligible', async () => {
      // When a low-trust FeedbackValidated is published
      await publish(harness, feedbackValidated(1, { rewardEligible: false }));

      // Then nothing is earned
      expect(await stored()).toEqual({ xp: 0, points: 0, entries: 0 });
    });

    it('fails, storing nothing, when the user has no wallet', async () => {
      // Given a user without a wallet
      const stranger = 'a0000000-0000-4000-8000-0000000000ff' as UserId;

      // When a FeedbackValidated for that user is published
      const run = publish(harness, feedbackValidated(1, { userId: stranger }));

      // Then it is an error and nothing changed
      await expect(run).rejects.toThrow();
      expect(await harness.ledgerOf(stranger)).toEqual([]);
    });
  });

  it('ends with one entry when two awards for the same feedback race (conflict and retry)', async () => {
    // Given a wallet copy loaded before another request awarded the same feedback
    const scripted = new ScriptedWalletRepository(harness.wallets, 'stale');
    wireGamification(harness, scripted);
    await publish(harness, userRegistered());
    await scripted.captureStale(
      WALLET_USER_ID,
      LedgerKey.reward(feedbackId(1)),
    );
    await awardThroughPort(harness, aClaim());

    // When the racing award is handled with the stale copy
    await publish(harness, feedbackValidated(1));

    // Then its save conflicted, the retry reloaded, and there is one entry and one credit
    expect(scripted.loads).toBe(2);
    expect(await stored()).toEqual({ xp: 10, points: 5, entries: 1 });
  });

  it('ends with one entry when the unique ledger key fires (backstop), logging a warning', async () => {
    // Given feedback 1 was awarded, and a repository whose first lookup wrongly says it was not
    const scripted = new ScriptedWalletRepository(harness.wallets, 'misled');
    wireGamification(harness, scripted);
    await publish(harness, userRegistered());
    await awardThroughPort(harness, aClaim());

    // When the same feedback is handled again
    await publish(harness, feedbackValidated(1));

    // Then the unique key rolled the first attempt back, the retry found the key: one entry, one credit
    expect(scripted.loads).toBe(2);
    expect(await stored()).toEqual({ xp: 10, points: 5, entries: 1 });
    expect(
      harness.logger.warnings.map((warning) => warning.fields['key']),
    ).toEqual(['reward:f0000000-0000-4000-8000-000000000001']);
  });
});
