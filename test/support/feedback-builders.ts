// Small builders for Feedback tests.

import { RewardCooldown } from '../../src/contexts/feedback/domain/reward-cooldown/reward-cooldown.js';
import {
  DEFAULT_REWARD_LIMITS,
  type RewardLimits,
} from '../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import type {
  BranchId,
  FeedbackId,
  UserId,
} from '../../src/shared-kernel/ids.js';

export const FEEDBACK_USER_ID =
  'a0000000-0000-4000-8000-0000000000f1' as UserId;
export const FEEDBACK_BRANCH_ID =
  'c0000000-0000-4000-8000-0000000000f1' as BranchId;
export const OTHER_FEEDBACK_BRANCH_ID =
  'c0000000-0000-4000-8000-0000000000f2' as BranchId;

/** The start of every time line in the reward rule tests. */
export const T0 = new Date('2026-10-14T09:00:00.000Z');

/** `hours` and `minutes` after T0. */
export const after = (hours: number, minutes = 0): Date =>
  new Date(T0.getTime() + (hours * 60 + minutes) * 60_000);

/** Feedback ids f0000000-…-0000000000f1, …f2, … */
export const feedbackId = (n: number): FeedbackId =>
  `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}` as FeedbackId;

/** A cooldown of FEEDBACK_USER_ID at FEEDBACK_BRANCH_ID before their first feedback there. */
export const aCooldown = (
  limits: RewardLimits = DEFAULT_REWARD_LIMITS,
): RewardCooldown =>
  RewardCooldown.open(
    { userId: FEEDBACK_USER_ID, branchId: FEEDBACK_BRANCH_ID },
    limits,
  );

/** Reserves, expecting success; for set-up steps that are not the thing under test. */
export function reserved(cooldown: RewardCooldown, id: number, at: Date): void {
  const result = cooldown.reserve(feedbackId(id), at);
  if (!result.ok)
    throw new Error(`set-up reserve was rejected: ${result.error.code}`);
}
