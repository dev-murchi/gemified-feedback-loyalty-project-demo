import {
  typedId,
  type Branded,
  type FeedbackId,
  type UserId,
} from '../../../../shared-kernel/ids.js';

export type LedgerEntryId = Branded<string, 'LedgerEntryId'>;
export const LedgerEntryId = typedId<LedgerEntryId>();

/**
 * Idempotency key of a ledger entry (FR-GAM-04): one per feedback and entry type, so a reward and a
 * later clawback of the same feedback are separate entries (SDD 6.1).
 */
export type LedgerKey = Branded<string, 'LedgerKey'>;

export const LedgerKey = {
  reward: (feedbackId: FeedbackId): LedgerKey =>
    `reward:${feedbackId}` as LedgerKey,
  clawback: (feedbackId: FeedbackId): LedgerKey =>
    `clawback:${feedbackId}` as LedgerKey,
};

/** Clawback (FR-GAM-07) is not built yet; the type and key already leave room for it. */
export type LedgerEntryType = 'reward' | 'clawback';

/** An append-only XP and points change (FR-GAM-03). Never changed after it is written. */
export interface LedgerEntry {
  readonly id: LedgerEntryId;
  readonly userId: UserId;
  readonly feedbackId: FeedbackId;
  readonly key: LedgerKey;
  readonly type: LedgerEntryType;
  readonly xpDelta: number;
  readonly pointsDelta: number;
  /** The wallet's total XP right after this entry (SDD 6.1); level-up is derived from it. */
  readonly xpTotalAfter: number;
  /** The customer's visit: the feedback's submission time (FR-GAM-08). */
  readonly earnedAt: Date;
  readonly createdAt: Date;
}

/** Entries hold Dates, which are mutable; copies keep callers from changing an entry. */
export const copyLedgerEntry = (entry: LedgerEntry): LedgerEntry => ({
  ...entry,
  earnedAt: new Date(entry.earnedAt),
  createdAt: new Date(entry.createdAt),
});
