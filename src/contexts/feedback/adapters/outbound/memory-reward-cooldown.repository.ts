import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../../shared-kernel/adapters/save-versioned.js';
import type {
  BranchId,
  FeedbackId,
  UserId,
} from '../../../../shared-kernel/ids.js';
import type { EventCollector } from '../../../../shared-kernel/unit-of-work.js';
import type { RewardCooldownRepository } from '../../application/ports/reward-cooldown-repository.js';
import { RewardCooldown } from '../../domain/reward-cooldown/reward-cooldown.js';
import type { RewardLimits } from '../../domain/reward-cooldown/reward-limits.js';

/** Plain stored cooldown; mirrors REWARD_COOLDOWNS (SDD 6.1), one row per user and branch. */
export interface RewardCooldownRow {
  readonly userId: string;
  readonly branchId: string;
  readonly lastRewardedAt: Date | null;
  readonly attemptTimes: readonly Date[];
  readonly pendingFeedbackId: string | null;
  readonly version: number;
}

export interface MemoryRewardCooldownRepositoryDeps {
  readonly table: InMemoryTable<string, RewardCooldownRow>;
  readonly events: EventCollector;
  /** The configured rules; they are not stored with the row. */
  readonly limits: RewardLimits;
}

const keyOf = (userId: string, branchId: string): string =>
  `${userId}:${branchId}`;

export class MemoryRewardCooldownRepository implements RewardCooldownRepository {
  constructor(private readonly deps: MemoryRewardCooldownRepositoryDeps) {}

  find(
    userId: UserId,
    branchId: BranchId,
  ): Promise<RewardCooldown | undefined> {
    const row = this.deps.table.get(keyOf(userId, branchId));
    return Promise.resolve(
      row === undefined ? undefined : this.#toCooldown(row),
    );
  }

  save(cooldown: RewardCooldown): Promise<void> {
    return saveVersioned(this.deps, cooldown, {
      key: keyOf(cooldown.userId, cooldown.branchId),
      toRow: (version): RewardCooldownRow => ({
        userId: cooldown.userId,
        branchId: cooldown.branchId,
        lastRewardedAt: cooldown.lastRewardedAt,
        attemptTimes: cooldown.attemptTimes,
        pendingFeedbackId: cooldown.pendingFeedbackId,
        version,
      }),
    });
  }

  #toCooldown(row: RewardCooldownRow): RewardCooldown {
    return RewardCooldown.reconstitute(
      {
        userId: row.userId as UserId,
        branchId: row.branchId as BranchId,
        lastRewardedAt: row.lastRewardedAt,
        attemptTimes: row.attemptTimes,
        pendingFeedbackId: row.pendingFeedbackId as FeedbackId | null,
      },
      row.version,
      this.deps.limits,
    );
  }
}
