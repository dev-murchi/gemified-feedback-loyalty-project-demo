import { LevelPolicy } from '../../../src/contexts/gamification/domain/level-policy.js';
import { DEFAULT_REWARD_AMOUNTS } from '../../../src/contexts/gamification/domain/reward-amounts.js';
import { LedgerKey } from '../../../src/contexts/gamification/domain/wallet/ledger-entry.js';
import {
  Wallet,
  type RewardClaim,
  type RewardRules,
} from '../../../src/contexts/gamification/domain/wallet/wallet.js';
import type { FeedbackId, UserId } from '../../../src/shared-kernel/ids.js';
import { FakeClock } from '../../support/fake-clock.js';
import { takeUnsavedEntries } from '../../support/gamification-access.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const USER_ID = 'a0000000-0000-4000-8000-000000000001' as UserId;
const FEEDBACK_ID = 'f0000000-0000-4000-8000-000000000001' as FeedbackId;
const SUBMITTED_AT = new Date('2026-10-12T09:00:00.000Z');

const rules = (
  clock = new FakeClock(new Date('2026-10-12T09:00:05.000Z')),
): RewardRules => ({
  amounts: DEFAULT_REWARD_AMOUNTS,
  ids: new SequentialIdGenerator(),
  clock,
});

const claim = (overrides: Partial<RewardClaim> = {}): RewardClaim => ({
  feedbackId: FEEDBACK_ID,
  submittedAt: SUBMITTED_AT,
  rewardEligible: true,
  ...overrides,
});

/** A stored wallet, loaded for this feedback's ledger key (as findWithLedgerKey does). */
const storedWallet = (xp: number, rewarded: boolean): Wallet =>
  Wallet.reconstitute({ userId: USER_ID, xp, points: xp / 2 }, 3, [
    { key: LedgerKey.reward(FEEDBACK_ID), exists: rewarded },
  ]);

describe('Wallet', () => {
  it('opens with 0 XP, 0 points and level 1, never stored (FR-AUTH-04)', () => {
    // Given a new user
    // When the wallet is opened
    const wallet = Wallet.open(USER_ID);

    // Then it starts empty, never stored, and its XP means level 1
    expect([wallet.xp, wallet.points, wallet.version]).toEqual([0, 0, 0]);
    expect(new LevelPolicy().levelFor(wallet.xp)).toBe(1);
  });

  it('awards 10 XP and 5 points with one reward entry (FR-GAM-01)', () => {
    // Given an open wallet and the current time
    const clock = new FakeClock(new Date('2026-10-12T09:00:05.000Z'));
    const wallet = Wallet.open(USER_ID);

    // When an eligible feedback is awarded
    const result = wallet.award(claim(), rules(clock));

    // Then the balance moved and exactly one entry describes it
    expect([wallet.xp, wallet.points]).toEqual([10, 5]);
    expect(result.outcome).toBe('awarded');
    expect(takeUnsavedEntries(wallet)).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        userId: USER_ID,
        feedbackId: FEEDBACK_ID,
        key: 'reward:f0000000-0000-4000-8000-000000000001',
        type: 'reward',
        xpDelta: 10,
        pointsDelta: 5,
        xpTotalAfter: 10,
        earnedAt: SUBMITTED_AT,
        createdAt: clock.now(),
      },
    ]);
  });

  it('keeps the submission time as earning date when awarded long after (FR-GAM-08)', () => {
    // Given a feedback submitted a day before it is awarded (e.g. after an analysis outage)
    const clock = new FakeClock(new Date('2026-10-13T09:00:00.000Z'));
    const wallet = Wallet.open(USER_ID);

    // When it is awarded
    wallet.award(claim(), rules(clock));

    // Then the entry is earned at submission, created now
    const [entry] = takeUnsavedEntries(wallet);
    expect(entry?.earnedAt).toEqual(SUBMITTED_AT);
    expect(entry?.createdAt).toEqual(clock.now());
  });

  it('changes nothing for a feedback that is not reward-eligible', () => {
    // Given an open wallet
    const wallet = Wallet.open(USER_ID);

    // When a non-eligible feedback is awarded
    const result = wallet.award(claim({ rewardEligible: false }), rules());

    // Then nothing is earned or recorded
    expect(result.outcome).toBe('not_eligible');
    expect([wallet.xp, wallet.points]).toEqual([0, 0]);
    expect(takeUnsavedEntries(wallet)).toEqual([]);
  });

  it('changes nothing when the reward key is already in the ledger (FR-GAM-04)', () => {
    // Given a stored wallet loaded for this feedback's key, which is already in the ledger
    const wallet = storedWallet(10, true);

    // When the same feedback is awarded again
    const result = wallet.award(claim(), rules());

    // Then it is reported as already awarded and nothing changes
    expect(result.outcome).toBe('already_awarded');
    expect([wallet.xp, wallet.points]).toEqual([10, 5]);
    expect(takeUnsavedEntries(wallet)).toEqual([]);
  });

  it('awards the same feedback only once on the same instance', () => {
    // Given a wallet that just awarded a feedback
    const wallet = Wallet.open(USER_ID);
    wallet.award(claim(), rules());

    // When the same feedback is awarded again before saving
    const second = wallet.award(claim(), rules());

    // Then the second award changes nothing
    expect(second.outcome).toBe('already_awarded');
    expect(wallet.xp).toBe(10);
    expect(takeUnsavedEntries(wallet)).toHaveLength(1);
  });

  it('awards a stored wallet loaded for the key, and records the new total XP in the entry', () => {
    // Given a stored wallet with 95 XP, loaded for this feedback's key, which is not in the ledger
    const wallet = storedWallet(95, false);

    // When 10 XP are awarded
    wallet.award(claim(), rules());

    // Then the entry holds the new total, which crosses into level 2
    expect(wallet.xp).toBe(105);
    expect(takeUnsavedEntries(wallet)[0]?.xpTotalAfter).toBe(105);
    expect(new LevelPolicy().levelFor(wallet.xp)).toBe(2);
  });

  it('refuses to award when the wallet was not loaded for the ledger key of the feedback', () => {
    // Given a stored wallet loaded without any ledger key
    const wallet = Wallet.reconstitute(
      { userId: USER_ID, xp: 10, points: 5 },
      1,
    );

    // When a feedback is awarded
    const award = () => wallet.award(claim(), rules());

    // Then it is a programming error and nothing changes
    expect(award).toThrow();
    expect(wallet.xp).toBe(10);
    expect(takeUnsavedEntries(wallet)).toEqual([]);
  });

  it('hands out unsaved entries once, as copies', () => {
    // Given a wallet with one unsaved entry
    const wallet = Wallet.open(USER_ID);
    const result = wallet.award(claim(), rules());

    // When the returned entry is changed and the entries are taken twice
    if (result.outcome === 'awarded') result.entry.earnedAt.setTime(0);
    const first = takeUnsavedEntries(wallet);
    first[0]?.createdAt.setTime(0);
    const second = takeUnsavedEntries(wallet);

    // Then the first take has the original entry and the second has none
    expect(first[0]?.earnedAt).toEqual(SUBMITTED_AT);
    expect(second).toEqual([]);
  });
});
