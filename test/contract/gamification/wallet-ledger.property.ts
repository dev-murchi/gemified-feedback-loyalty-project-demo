// TC-GAM-04 (NFR-DATA-01): after any sequence of operations the wallet equals its ledger. Part of
// the wallet repository contract, so it runs against PostgreSQL too (S0-11).

import * as fc from 'fast-check';
import { LevelPolicy } from '../../../src/gamification/domain/level-policy.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import {
  aClaim,
  awardThroughPort,
  feedbackId,
  rewardRules,
  storeOpenWallet,
  WALLET_USER_ID,
} from '../../support/gamification-builders.js';
import type { GamificationHarness } from '../../support/memory-gamification.js';
import { LedgerKey } from '../../../src/gamification/domain/wallet/ledger-entry.js';

type Step =
  | {
      readonly kind: 'award';
      readonly feedback: number;
      readonly eligible: boolean;
    }
  | { readonly kind: 'duplicate'; readonly pick: number }
  | { readonly kind: 'stale'; readonly feedback: number }
  | { readonly kind: 'rollback'; readonly feedback: number };

const feedbackNumber = fc.integer({ min: 1, max: 6 });

const step: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constant('award' as const),
    feedback: feedbackNumber,
    eligible: fc.boolean(),
  }),
  fc.record({ kind: fc.constant('duplicate' as const), pick: fc.nat() }),
  fc.record({ kind: fc.constant('stale' as const), feedback: feedbackNumber }),
  fc.record({
    kind: fc.constant('rollback' as const),
    feedback: feedbackNumber,
  }),
);

const loadFor = async (harness: GamificationHarness, n: number) => {
  const key = LedgerKey.reward(feedbackId(n));
  const wallet = await harness.wallets.findWithLedgerKey(WALLET_USER_ID, key);
  if (wallet === undefined) throw new Error('wallet is not stored');
  return wallet;
};

/** A copy loaded before another save moved the stored version on; its save must conflict. */
async function staleSave(
  harness: GamificationHarness,
  n: number,
): Promise<void> {
  const stale = await loadFor(harness, n);
  await harness.uow.run(async () =>
    harness.wallets.save(await loadFor(harness, n)),
  );
  stale.award(aClaim({ feedbackId: feedbackId(n) }), rewardRules());
  const run = harness.uow.run(() => harness.wallets.save(stale));
  await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
}

/** A unit of work that awards and saves, then fails: everything must be rolled back. */
async function rolledBackAward(
  harness: GamificationHarness,
  n: number,
): Promise<void> {
  const run = harness.uow.run(async () => {
    const wallet = await loadFor(harness, n);
    wallet.award(aClaim({ feedbackId: feedbackId(n) }), rewardRules());
    await harness.wallets.save(wallet);
    throw new Error('fails after saving');
  });
  await expect(run).rejects.toThrow('fails after saving');
}

async function apply(
  harness: GamificationHarness,
  current: Step,
  awarded: number[],
): Promise<void> {
  if (current.kind === 'award') {
    const claim = aClaim({
      feedbackId: feedbackId(current.feedback),
      rewardEligible: current.eligible,
    });
    if ((await awardThroughPort(harness, claim)) === 'awarded')
      awarded.push(current.feedback);
  } else if (current.kind === 'duplicate') {
    const earlier = awarded[current.pick % Math.max(awarded.length, 1)];
    if (earlier === undefined) return;
    const outcome = await awardThroughPort(
      harness,
      aClaim({ feedbackId: feedbackId(earlier) }),
    );
    expect(outcome).toBe('already_awarded');
  } else if (current.kind === 'stale') {
    await staleSave(harness, current.feedback);
  } else {
    await rolledBackAward(harness, current.feedback);
  }
}

async function expectWalletEqualsLedger(
  harness: GamificationHarness,
): Promise<void> {
  const wallet = await harness.wallets.findById(WALLET_USER_ID);
  if (wallet === undefined) throw new Error('wallet is not stored');
  const ledger = await harness.ledgerOf(WALLET_USER_ID);
  // Highest total, not the last row: row order would depend on created_at in PostgreSQL. Valid only
  // while XP never decreases. Revisit when clawback (FR-GAM-07) arrives.
  const highestTotal = Math.max(
    0,
    ...ledger.map((entry) => entry.xpTotalAfter),
  );
  const levels = new LevelPolicy();

  expect(wallet.xp).toBe(
    ledger.reduce((total, entry) => total + entry.xpDelta, 0),
  );
  expect(wallet.points).toBe(
    ledger.reduce((total, entry) => total + entry.pointsDelta, 0),
  );
  expect(new Set(ledger.map((entry) => entry.key)).size).toBe(ledger.length);
  expect(wallet.xp).toBe(highestTotal);
  expect(levels.levelFor(wallet.xp)).toBe(levels.levelFor(highestTotal));
}

export function walletLedgerProperty(
  makeHarness: () => Promise<GamificationHarness>,
): void {
  it('keeps the wallet equal to its ledger after any sequence of operations (TC-GAM-04)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 25 }), async (steps) => {
        // Given a stored, empty wallet
        const harness = await makeHarness();
        try {
          await storeOpenWallet(harness);
          const awarded: number[] = [];

          // When the steps run, Then after every step the wallet equals its ledger
          for (const current of steps) {
            await apply(harness, current, awarded);
            await expectWalletEqualsLedger(harness);
          }
        } finally {
          // Also after a failing run, so a PostgreSQL harness (S0-11) never leaks a connection.
          await harness.dispose();
        }
      }),
      { numRuns: 150 },
    );
  });
}
