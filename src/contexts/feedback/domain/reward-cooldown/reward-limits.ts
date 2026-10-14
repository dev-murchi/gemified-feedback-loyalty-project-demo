const HOUR_MS = 60 * 60 * 1000;

/**
 * The configurable values of the reward rules (FR-QR-07, FR-QR-09, SDD 6.4): how long after a
 * rewarded feedback the next reward must wait, and how many feedbacks a user may submit to one
 * branch in any `attemptWindowMs`.
 */
export class RewardLimits {
  private constructor(
    readonly cooldownMs: number,
    readonly attemptWindowMs: number,
    readonly maxAttempts: number,
  ) {}

  /** Throws for values that are not positive integers: a wrong configuration is a start-up error. */
  static create(limits: {
    readonly cooldownMs: number;
    readonly attemptWindowMs: number;
    readonly maxAttempts: number;
  }): RewardLimits {
    for (const [name, value] of Object.entries(limits)) {
      if (!Number.isInteger(value) || value < 1)
        throw new Error(
          `Reward limit ${name} must be a positive integer, got ${value}`,
        );
    }
    return new RewardLimits(
      limits.cooldownMs,
      limits.attemptWindowMs,
      limits.maxAttempts,
    );
  }
}

/** 24 hours between rewards, at most 3 feedbacks in any 24 hours. */
export const DEFAULT_REWARD_LIMITS = RewardLimits.create({
  cooldownMs: 24 * HOUR_MS,
  attemptWindowMs: 24 * HOUR_MS,
  maxAttempts: 3,
});
