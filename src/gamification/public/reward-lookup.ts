import type { FeedbackId, UserId } from '../../shared-kernel/ids.js';

/** What a feedback earned, as GET /v1/feedbacks/{id} shows it (`reward`, `levelUp`). */
export interface FeedbackReward {
  readonly xp: number;
  readonly points: number;
  /** The level change this reward caused, or null when the level stayed the same (FR-GAM-05). */
  readonly levelUp: { readonly from: number; readonly to: number } | null;
}

/**
 * Open host service (docs/06 §5.5): the reward a feedback earned and the level-up it caused
 * (FR-GAM-05, FR-GAM-06). `undefined` when the feedback earned nothing. Historical: the answer does
 * not change when the user earns more later.
 */
export interface RewardLookup {
  rewardFor(
    userId: UserId,
    feedbackId: FeedbackId,
  ): Promise<FeedbackReward | undefined>;
}
