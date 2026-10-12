import { LedgerKey } from '../../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import { Wallet } from '../../../src/contexts/gamification/domain/wallet/wallet.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import type { UserId } from '../../../src/shared-kernel/ids.js';
import {
  aClaim,
  awardThroughPort,
  feedbackId,
  rewardRules,
  storeOpenWallet,
  WALLET_USER_ID,
} from '../../support/gamification-builders.js';
import type { GamificationHarness } from '../../support/memory-gamification.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

export function walletRepositoryContract(
  makeHarness: () => Promise<GamificationHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => Wallet.open(WALLET_USER_ID),
        save: (wallet) => harness.wallets.save(wallet),
        load: () => harness.wallets.findById(WALLET_USER_ID),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('balance and ledger', () => {
    let harness: GamificationHarness;
    const balance = async () => {
      const wallet = await harness.wallets.findById(WALLET_USER_ID);
      return {
        xp: wallet?.xp,
        points: wallet?.points,
        version: wallet?.version,
      };
    };
    const loadFor = async (n: number) => {
      const key = LedgerKey.reward(feedbackId(n));
      const wallet = await harness.wallets.findWithLedgerKey(
        WALLET_USER_ID,
        key,
      );
      if (wallet === undefined) throw new Error('wallet is not stored');
      return wallet;
    };

    beforeEach(async () => {
      harness = await makeHarness();
      await storeOpenWallet(harness);
    });

    afterEach(() => harness.dispose());

    it('stores nothing for an award that is not saved', async () => {
      // Given a wallet loaded for a feedback
      const wallet = await loadFor(1);

      // When it awards but is never saved
      wallet.award(aClaim(), rewardRules());

      // Then neither balance nor ledger changed
      expect(await balance()).toEqual({ xp: 0, points: 0, version: 1 });
      expect(await harness.ledgerOf(WALLET_USER_ID)).toEqual([]);
    });

    it('stores the balance and its ledger entry together', async () => {
      // Given a stored wallet
      // When a feedback is awarded and saved
      await awardThroughPort(harness, aClaim());

      // Then the balance and exactly one matching entry are stored
      expect(await balance()).toEqual({ xp: 10, points: 5, version: 2 });
      const ledger = await harness.ledgerOf(WALLET_USER_ID);
      expect(
        ledger.map((entry) => [entry.key, entry.xpDelta, entry.xpTotalAfter]),
      ).toEqual([['reward:f0000000-0000-4000-8000-000000000001', 10, 10]]);
    });

    it('stores neither balance nor entry when the save conflicts', async () => {
      // Given two copies of the wallet, loaded for two feedbacks
      const first = await loadFor(1);
      const stale = await loadFor(2);
      first.award(aClaim({ feedbackId: feedbackId(1) }), rewardRules());
      await harness.uow.run(() => harness.wallets.save(first));

      // When the stale copy awards and saves
      stale.award(aClaim({ feedbackId: feedbackId(2) }), rewardRules());
      const run = harness.uow.run(() => harness.wallets.save(stale));

      // Then it conflicts and only the first award is stored
      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect(await balance()).toEqual({ xp: 10, points: 5, version: 2 });
      expect(await harness.ledgerOf(WALLET_USER_ID)).toHaveLength(1);
    });

    it('tells the wallet whether the requested ledger key exists', async () => {
      // Given feedback 1 was awarded
      await awardThroughPort(harness, aClaim({ feedbackId: feedbackId(1) }));

      // When the wallet is loaded for feedback 1 and for feedback 2 and both are awarded
      const again = (await loadFor(1)).award(
        aClaim({ feedbackId: feedbackId(1) }),
        rewardRules(),
      );
      const other = (await loadFor(2)).award(
        aClaim({ feedbackId: feedbackId(2) }),
        rewardRules(),
      );

      // Then feedback 1 is already awarded and feedback 2 is not
      expect([again.outcome, other.outcome]).toEqual([
        'already_awarded',
        'awarded',
      ]);
    });

    it('refuses a ledger key that already exists, logs a warning and keeps nothing (backstop)', async () => {
      // Given feedback 1 was awarded, and a wallet copy that wrongly believes it was not
      await awardThroughPort(harness, aClaim());
      const stored = await harness.wallets.findById(WALLET_USER_ID);
      if (stored === undefined) throw new Error('wallet is not stored');
      const misled = Wallet.reconstitute(
        { userId: WALLET_USER_ID, xp: stored.xp, points: stored.points },
        stored.version,
        [{ key: LedgerKey.reward(feedbackId(1)), exists: false }],
      );

      // When it awards feedback 1 again and saves
      misled.award(aClaim(), rewardRules());
      const run = harness.uow.run(() => harness.wallets.save(misled));

      // Then the unique key fires as a conflict, is logged with the key, and nothing changed
      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect(
        harness.logger.warnings.map((warning) => warning.fields['key']),
      ).toEqual(['reward:f0000000-0000-4000-8000-000000000001']);
      expect(await balance()).toEqual({ xp: 10, points: 5, version: 2 });
      expect(await harness.ledgerOf(WALLET_USER_ID)).toHaveLength(1);
    });

    it('finds a stored ledger entry by key, and nothing for an unknown key or another user', async () => {
      // Given feedback 1 was awarded
      await awardThroughPort(harness, aClaim());
      const key = LedgerKey.reward(feedbackId(1));

      // When entries are looked up
      const found = await harness.wallets.findLedgerEntry(WALLET_USER_ID, key);
      const unknown = await harness.wallets.findLedgerEntry(
        WALLET_USER_ID,
        LedgerKey.reward(feedbackId(2)),
      );
      const otherUser = await harness.wallets.findLedgerEntry(
        'a0000000-0000-4000-8000-0000000000ff' as UserId,
        key,
      );

      // Then only the user's own stored entry is found
      expect([found?.key, found?.xpTotalAfter]).toEqual([key, 10]);
      expect([unknown, otherUser]).toEqual([undefined, undefined]);
    });

    it('never changes a stored ledger entry; later entries are appended', async () => {
      // Given one stored entry
      await awardThroughPort(harness, aClaim({ feedbackId: feedbackId(1) }));
      const [firstEntry] = await harness.ledgerOf(WALLET_USER_ID);

      // When another feedback is awarded
      await awardThroughPort(harness, aClaim({ feedbackId: feedbackId(2) }));

      // Then the first entry is unchanged and the new one follows it
      const ledger = await harness.ledgerOf(WALLET_USER_ID);
      expect(ledger[0]).toEqual(firstEntry);
      expect(ledger.map((entry) => entry.xpTotalAfter)).toEqual([10, 20]);
    });
  });
}
