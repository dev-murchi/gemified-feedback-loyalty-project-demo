import {
  DEFAULT_REWARD_AMOUNTS,
  RewardAmounts,
} from '../../../src/gamification/domain/reward-amounts.js';

describe('RewardAmounts (FR-GAM-01)', () => {
  it('defaults to 10 XP and 5 points', () => {
    // Given the default amounts
    // Then they are the agreed values
    expect([DEFAULT_REWARD_AMOUNTS.xp, DEFAULT_REWARD_AMOUNTS.points]).toEqual([
      10, 5,
    ]);
  });

  it('accepts zero', () => {
    // Given amounts of zero
    // When they are created
    const amounts = new RewardAmounts(0, 0);

    // Then they are kept
    expect([amounts.xp, amounts.points]).toEqual([0, 0]);
  });

  it.each([
    [-1, 5],
    [10, -1],
    [1.5, 5],
    [10, Number.NaN],
  ])('rejects %d XP and %d points', (xp, points) => {
    // Given amounts that are not non-negative integers
    // When they are created
    const create = () => new RewardAmounts(xp, points);

    // Then it is a configuration error
    expect(create).toThrow();
  });
});
