import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type {
  BranchId,
  FeedbackId,
  UserId,
} from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { RewardLimits } from './reward-limits.js';
import type { RewardRejection } from './rewarding-errors.js';

/** A cooldown belongs to one user at one branch. */
export interface CooldownKey {
  readonly userId: UserId;
  readonly branchId: BranchId;
}

export interface RewardCooldownState extends CooldownKey {
  /** Submission time of the last rewarded feedback (not the time it was analyzed). */
  readonly lastRewardedAt: Date | null;
  /** The sliding log: the times of the attempts still inside the window. */
  readonly attemptTimes: readonly Date[];
  readonly pendingFeedbackId: FeedbackId | null;
}

/** What a finished analysis means for the reward right: used up, or still available. */
export type CooldownOutcome = 'rewarded' | 'not_rewarded';

/** `ignored`: this feedback was not the pending one, so nothing changed and nothing needs saving. */
export type CompleteResult = 'completed' | 'ignored';

const seconds = (milliseconds: number): number =>
  Math.ceil(milliseconds / 1000);

/**
 * The reward rules of one user at one branch (docs/06 §5.3, SDD 6.4): one pending feedback at a
 * time, 24 hours between rewards counted from the last rewarded feedback's submission, and at most
 * 3 feedbacks in any 24 hours (a sliding log, not a fixed window). A rejected request is not an
 * attempt; a spam verdict does not give the attempt back.
 */
export class RewardCooldown extends AggregateRoot {
  #state: RewardCooldownState;

  private constructor(
    state: RewardCooldownState,
    version: number,
    private readonly limits: RewardLimits,
  ) {
    super(version);
    this.#state = {
      ...state,
      lastRewardedAt: copyOrNull(state.lastRewardedAt),
      attemptTimes: state.attemptTimes.map((time) => new Date(time)),
    };
  }

  /** The first feedback of this user at this branch: nothing pending, nothing rewarded, no attempts. */
  static open(key: CooldownKey, limits: RewardLimits): RewardCooldown {
    return new RewardCooldown(
      {
        ...key,
        lastRewardedAt: null,
        attemptTimes: [],
        pendingFeedbackId: null,
      },
      0,
      limits,
    );
  }

  /** Restores stored state; version 0 means never stored. */
  static reconstitute(
    state: RewardCooldownState,
    version: number,
    limits: RewardLimits,
  ): RewardCooldown {
    return new RewardCooldown(state, version, limits);
  }

  get userId(): UserId {
    return this.#state.userId;
  }

  get branchId(): BranchId {
    return this.#state.branchId;
  }

  get lastRewardedAt(): Date | null {
    return copyOrNull(this.#state.lastRewardedAt);
  }

  get attemptTimes(): readonly Date[] {
    return this.#state.attemptTimes.map((time) => new Date(time));
  }

  get pendingFeedbackId(): FeedbackId | null {
    return this.#state.pendingFeedbackId;
  }

  /** How many attempts count against the limit at `now` (those inside the sliding window). */
  attemptsWithin(now: Date): number {
    return this.#attemptsIn(now).length;
  }

  /**
   * Checks the rules in order (pending, cooldown, attempts) and, if all pass, records the attempt
   * and makes `feedbackId` the pending feedback. Otherwise nothing changes and the reason comes
   * back, with the time to wait where there is one.
   */
  reserve(feedbackId: FeedbackId, now: Date): Result<void, RewardRejection> {
    const rejection =
      this.#pendingRejection() ??
      this.#cooldownRejection(now) ??
      this.#attemptsRejection(now);
    if (rejection !== undefined) return err(rejection);
    this.#state = {
      ...this.#state,
      attemptTimes: [...this.#attemptsIn(now), new Date(now)],
      pendingFeedbackId: feedbackId,
    };
    return ok(undefined);
  }

  /**
   * Releases the lock when the pending feedback's analysis is applied. Only that feedback can
   * release it (SDD 6.4), so a late job of an older feedback changes nothing (TC-QR-08) and a
   * repeated call is harmless. A rewarded feedback starts the cooldown from its submission time.
   */
  complete(
    feedbackId: FeedbackId,
    outcome: CooldownOutcome,
    submittedAt: Date,
  ): CompleteResult {
    if (this.#state.pendingFeedbackId !== feedbackId) return 'ignored';
    this.#state = {
      ...this.#state,
      pendingFeedbackId: null,
      lastRewardedAt:
        outcome === 'rewarded'
          ? new Date(submittedAt)
          : this.#state.lastRewardedAt,
    };
    return 'completed';
  }

  /** Attempts newer than one window ago: an attempt exactly one window old no longer counts. */
  #attemptsIn(now: Date): Date[] {
    const cutoff = now.getTime() - this.limits.attemptWindowMs;
    return this.#state.attemptTimes.filter((time) => time.getTime() > cutoff);
  }

  #pendingRejection(): RewardRejection | undefined {
    return this.#state.pendingFeedbackId === null
      ? undefined
      : { code: 'FEEDBACK_PENDING' };
  }

  /** The next feedback may be rewarded exactly 24 hours after the last rewarded submission. */
  #cooldownRejection(now: Date): RewardRejection | undefined {
    const last = this.#state.lastRewardedAt;
    if (last === null) return undefined;
    const remaining = last.getTime() + this.limits.cooldownMs - now.getTime();
    return remaining > 0
      ? { code: 'REWARD_COOLDOWN', retryAfterSeconds: seconds(remaining) }
      : undefined;
  }

  /** When the limit is reached, the wait ends when enough old attempts have left the window. */
  #attemptsRejection(now: Date): RewardRejection | undefined {
    const inWindow = this.#attemptsIn(now)
      .map((time) => time.getTime())
      .sort((a, b) => a - b);
    const excess = inWindow.length - this.limits.maxAttempts;
    const blocking = inWindow[excess];
    if (excess < 0 || blocking === undefined) return undefined;
    return {
      code: 'ATTEMPTS_EXHAUSTED',
      retryAfterSeconds: seconds(
        blocking + this.limits.attemptWindowMs - now.getTime(),
      ),
    };
  }
}

const copyOrNull = (date: Date | null): Date | null =>
  date === null ? null : new Date(date);
