import type { BranchId, UserId } from '../../../../shared-kernel/ids.js';
import type { RewardCooldown } from '../../domain/reward-cooldown/reward-cooldown.js';

export interface RewardCooldownRepository {
  /** The cooldown of this user at this branch, or undefined before their first feedback there. */
  find(userId: UserId, branchId: BranchId): Promise<RewardCooldown | undefined>;
  /**
   * Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version. A
   * never-stored cooldown (version 0) is an insert, so two requests that both found nothing
   * conflict instead of both succeeding (TC-QR-01). Inside a unit of work.
   */
  save(cooldown: RewardCooldown): Promise<void>;
}
