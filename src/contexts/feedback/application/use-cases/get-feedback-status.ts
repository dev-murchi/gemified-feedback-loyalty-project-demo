import {
  FeedbackId,
  type BranchId,
  type UserId,
} from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { BranchDirectory } from '../../../catalog/public/branch-directory.js';
import type { RewardLookup } from '../../../gamification/public/reward-lookup.js';
import type { Feedback } from '../../domain/feedback/feedback.js';
import type { FeedbackNotFound } from '../../domain/feedback/feedback-errors.js';
import type { FeedbackStatus } from '../../domain/feedback/feedback-status.js';
import type { FeedbackRepository } from '../ports/feedback-repository.js';

export interface GetFeedbackStatusDeps {
  readonly feedbacks: FeedbackRepository;
  readonly branches: BranchDirectory;
  readonly rewards: RewardLookup;
}

export interface GetFeedbackStatusQuery {
  readonly userId: UserId;
  /** The path parameter as received. */
  readonly feedbackId: string;
}

/** The `FeedbackStatus` body of GET /v1/feedbacks/{id}. */
export interface FeedbackStatusView {
  readonly feedbackId: FeedbackId;
  readonly status: FeedbackStatus;
  readonly submittedAt: Date;
  readonly analyzedAt: Date | null;
  readonly branch: { readonly id: BranchId; readonly name: string };
  readonly reward: { readonly xp: number; readonly points: number } | null;
  readonly levelUp: { readonly from: number; readonly to: number } | null;
}

const NOT_FOUND: FeedbackNotFound = { code: 'NOT_FOUND' };

/**
 * GET /v1/feedbacks/{id} (FR-GAM-06, TC-GAM-09). Only the owner sees a feedback; another user's,
 * an unknown and a malformed id all give NOT_FOUND, so ids cannot be probed. The reward and the
 * level-up come from Gamification, the branch name from Catalog.
 */
export class GetFeedbackStatus {
  constructor(private readonly deps: GetFeedbackStatusDeps) {}

  async execute(
    query: GetFeedbackStatusQuery,
  ): Promise<Result<FeedbackStatusView, FeedbackNotFound>> {
    const id = FeedbackId.create(query.feedbackId);
    if (!id.ok) return err(NOT_FOUND);
    const feedback = await this.deps.feedbacks.find(id.value);
    if (feedback?.userId !== query.userId) return err(NOT_FOUND);
    return ok(await this.#view(feedback));
  }

  async #view(feedback: Feedback): Promise<FeedbackStatusView> {
    const name = await this.deps.branches.nameOf(feedback.branchId);
    if (name === undefined)
      throw new Error(
        `Branch ${feedback.branchId} of feedback ${feedback.id} is missing`,
      );
    const reward = await this.deps.rewards.rewardFor(
      feedback.userId,
      feedback.id,
    );
    return {
      feedbackId: feedback.id,
      status: feedback.status,
      submittedAt: feedback.submittedAt,
      analyzedAt: feedback.analyzedAt,
      branch: { id: feedback.branchId, name },
      reward:
        reward === undefined ? null : { xp: reward.xp, points: reward.points },
      levelUp: reward?.levelUp ?? null,
    };
  }
}
