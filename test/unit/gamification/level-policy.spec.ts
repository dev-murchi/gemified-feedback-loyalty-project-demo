import { LevelPolicy } from '../../../src/contexts/gamification/domain/level-policy.js';

describe('LevelPolicy (FR-GAM-02)', () => {
  const levels = new LevelPolicy();

  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [599, 3],
    [600, 4],
  ])('total XP %d is level %d (TC-GAM-05)', (totalXp, level) => {
    // Given a total XP
    // When its level is derived
    // Then it matches the agreed thresholds
    expect(levels.levelFor(totalXp)).toBe(level);
  });

  it.each([
    [1, 0],
    [2, 100],
    [3, 300],
    [4, 600],
  ])('reaching level %d takes %d total XP', (level, xp) => {
    // Given a level
    // When the XP needed to reach it is computed
    // Then it is 100 × L × (L − 1) / 2
    expect(levels.xpToReach(level)).toBe(xp);
  });

  it('uses a configured step', () => {
    // Given a step of 50 XP
    const custom = new LevelPolicy(50);

    // When levels are derived
    // Then level 2 starts at 50 and level 3 at 150
    expect([
      custom.levelFor(49),
      custom.levelFor(50),
      custom.levelFor(150),
    ]).toEqual([1, 2, 3]);
  });
});

describe('LevelPolicy configuration', () => {
  it.each([0, -100, 1.5, Number.NaN])('rejects the step %d', (step) => {
    // Given a step that is not a positive integer
    // When a policy is created with it
    const create = () => new LevelPolicy(step);

    // Then it is a configuration error
    expect(create).toThrow();
  });
});
