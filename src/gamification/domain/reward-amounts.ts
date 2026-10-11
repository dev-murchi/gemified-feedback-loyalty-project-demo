const isNonNegativeInteger = (value: number): boolean =>
  Number.isInteger(value) && value >= 0;

/**
 * What one valid feedback earns (FR-GAM-01); configurable, the agreed default is 10 XP and 5
 * points. Amounts that are not non-negative integers are a configuration error and throw. Private
 * fields make it impossible to pass an unchecked plain object instead.
 */
export class RewardAmounts {
  readonly #xp: number;
  readonly #points: number;

  constructor(xp: number, points: number) {
    if (!isNonNegativeInteger(xp) || !isNonNegativeInteger(points)) {
      throw new RangeError(
        `Reward amounts must be non-negative integers, got ${xp} XP, ${points} points`,
      );
    }
    this.#xp = xp;
    this.#points = points;
  }

  get xp(): number {
    return this.#xp;
  }

  get points(): number {
    return this.#points;
  }
}

export const DEFAULT_REWARD_AMOUNTS = new RewardAmounts(10, 5);
