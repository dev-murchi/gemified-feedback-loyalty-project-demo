import { AggregateRoot } from '../../../shared-kernel/aggregate-root.js';
import type { Clock } from '../../../shared-kernel/clock.js';
import type { IdGenerator } from '../../../shared-kernel/id-generator.js';
import type { FeedbackId, UserId } from '../../../shared-kernel/ids.js';
import type { RewardAmounts } from '../reward-amounts.js';
import { takeNewLedgerEntries } from './ledger-access.js';
import {
  copyLedgerEntry,
  LedgerEntryId,
  LedgerKey,
  type LedgerEntry,
} from './ledger-entry.js';

export interface WalletState {
  readonly userId: UserId;
  readonly xp: number;
  readonly points: number;
}

/** What the repository found when it loaded the wallet for a ledger key (findWithLedgerKey). */
export interface LedgerKeyCheck {
  readonly key: LedgerKey;
  readonly exists: boolean;
}

/** A validated feedback, as Gamification needs it (from FeedbackValidated). */
export interface RewardClaim {
  readonly feedbackId: FeedbackId;
  readonly submittedAt: Date;
  readonly rewardEligible: boolean;
}

/** What awarding needs besides the claim. */
export interface RewardRules {
  readonly amounts: RewardAmounts;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Every outcome is a success for the caller; only 'awarded' changes the wallet. */
export type AwardOutcome =
  | { readonly outcome: 'awarded'; readonly entry: LedgerEntry }
  | { readonly outcome: 'already_awarded' }
  | { readonly outcome: 'not_eligible' };

/**
 * A user's XP and points (docs/06 §5.5); the level is derived from XP with LevelPolicy and never
 * stored here. The balance changes only together with a new ledger entry. The ledger history is
 * not loaded: the wallet knows a ledger key only if it was loaded for that key (findWithLedgerKey)
 * or created the entry itself. A never-stored wallet has an empty ledger, so every key is absent.
 */
export class Wallet extends AggregateRoot {
  #state: WalletState;
  /** Keys whose presence is known: true = in the ledger, false = checked and absent. */
  readonly #ledgerKeys: Map<string, boolean>;
  readonly #ledgerIsEmpty: boolean;
  #newEntries: LedgerEntry[] = [];

  private constructor(
    state: WalletState,
    version: number,
    checks: readonly LedgerKeyCheck[],
  ) {
    super(version);
    this.#state = state;
    this.#ledgerKeys = new Map(
      checks.map((check) => [check.key, check.exists]),
    );
    this.#ledgerIsEmpty = version === 0 && checks.length === 0;
  }

  /** FR-AUTH-04: a new wallet has 0 XP and 0 points (level 1). */
  static open(userId: UserId): Wallet {
    return new Wallet({ userId, xp: 0, points: 0 }, 0, []);
  }

  /** Restores a stored wallet, with the ledger keys it was loaded for. */
  static reconstitute(
    state: WalletState,
    version: number,
    checks: readonly LedgerKeyCheck[] = [],
  ): Wallet {
    return new Wallet(state, version, checks);
  }

  get userId(): UserId {
    return this.#state.userId;
  }

  get xp(): number {
    return this.#state.xp;
  }

  get points(): number {
    return this.#state.points;
  }

  /**
   * FR-GAM-01, FR-GAM-04: an eligible feedback earns the configured XP and points once. Asking again
   * for the same feedback, or for a non-eligible one, changes nothing and is not an error. Throws if
   * the wallet was not loaded for this feedback's ledger key (a programming error).
   */
  award(claim: RewardClaim, rules: RewardRules): AwardOutcome {
    if (!claim.rewardEligible) return { outcome: 'not_eligible' };
    const key = LedgerKey.reward(claim.feedbackId);
    if (this.#keyExists(key)) return { outcome: 'already_awarded' };
    const entry = this.#rewardEntry(claim, rules, key);
    this.#state = {
      ...this.#state,
      xp: entry.xpTotalAfter,
      points: this.#state.points + entry.pointsDelta,
    };
    this.#ledgerKeys.set(key, true);
    this.#newEntries.push(entry);
    return { outcome: 'awarded', entry: copyLedgerEntry(entry) };
  }

  /** Returns the entries created since the last save and clears them (repository only). */
  [takeNewLedgerEntries](): readonly LedgerEntry[] {
    const entries = this.#newEntries;
    this.#newEntries = [];
    return entries.map(copyLedgerEntry);
  }

  #keyExists(key: LedgerKey): boolean {
    const known = this.#ledgerKeys.get(key);
    if (known !== undefined) return known;
    if (this.#ledgerIsEmpty) return false;
    throw new Error(
      `Wallet ${this.#state.userId} was not loaded for ledger key ${key}; use findWithLedgerKey`,
    );
  }

  #rewardEntry(
    claim: RewardClaim,
    rules: RewardRules,
    key: LedgerKey,
  ): LedgerEntry {
    return {
      id: LedgerEntryId.generate(rules.ids),
      userId: this.#state.userId,
      feedbackId: claim.feedbackId,
      key,
      type: 'reward',
      xpDelta: rules.amounts.xp,
      pointsDelta: rules.amounts.points,
      xpTotalAfter: this.#state.xp + rules.amounts.xp,
      earnedAt: new Date(claim.submittedAt),
      createdAt: rules.clock.now(),
    };
  }
}
