/**
 * Levels from total XP (FR-GAM-02, SRS S-5): going from level n to n + 1 costs n × step XP, so the
 * total XP to reach level L is step × L × (L − 1) / 2 (step 100: level 2 at 100, 3 at 300, 4 at 600).
 * XP is never reset. The step is configurable; the default is the agreed 100. A step that is not a
 * positive integer is a configuration error and throws.
 */
export class LevelPolicy {
  readonly #step: number;

  constructor(step = 100) {
    if (!Number.isInteger(step) || step <= 0) {
      throw new RangeError(
        `Level step must be a positive integer, got ${step}`,
      );
    }
    this.#step = step;
  }

  /** Total XP needed to reach `level`. */
  xpToReach(level: number): number {
    return (this.#step * level * (level - 1)) / 2;
  }

  levelFor(totalXp: number): number {
    let level = 1;
    while (this.xpToReach(level + 1) <= totalXp) level += 1;
    return level;
  }
}
