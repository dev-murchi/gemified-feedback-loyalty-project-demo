import {
  MemoryFeedbackRepository,
  type FeedbackRow,
} from '../../src/contexts/feedback/adapters/outbound/memory-feedback.repository.js';
import {
  MemoryRewardCooldownRepository,
  type RewardCooldownRow,
} from '../../src/contexts/feedback/adapters/outbound/memory-reward-cooldown.repository.js';
import type { FeedbackRepository } from '../../src/contexts/feedback/application/ports/feedback-repository.js';
import type { RewardCooldownRepository } from '../../src/contexts/feedback/application/ports/reward-cooldown-repository.js';
import {
  DEFAULT_REWARD_LIMITS,
  type RewardLimits,
} from '../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import type { UnitOfWork } from '../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from './fake-clock.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** Everything a Feedback repository test needs; the PostgreSQL harness (S0-11) has the same shape. */
export interface FeedbackHarness {
  readonly uow: UnitOfWork;
  readonly cooldowns: RewardCooldownRepository;
  readonly feedbacks: FeedbackRepository;
  /** The events waiting for the queue, oldest first. */
  outbox(): Promise<readonly OutboxRecord[]>;
  dispose(): Promise<void>;
}

/** The Feedback repositories on fresh in-memory tables sharing one in-memory unit of work. */
export function memoryFeedbackHarness(
  limits: RewardLimits = DEFAULT_REWARD_LIMITS,
): Promise<FeedbackHarness> {
  const cooldowns = new InMemoryTable<string, RewardCooldownRow>();
  const feedbacks = new InMemoryTable<string, FeedbackRow>();
  const outbox = new InMemoryTable<string, OutboxRecord>();
  const uow = new InMemoryUnitOfWork({
    routes: fixedRoutes({
      FeedbackSubmitted: { outbox: true },
      FeedbackValidated: { sync: [] },
    }),
    tables: [cooldowns, feedbacks],
    outbox,
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  return Promise.resolve({
    uow,
    cooldowns: new MemoryRewardCooldownRepository({
      table: cooldowns,
      events: uow,
      limits,
    }),
    feedbacks: new MemoryFeedbackRepository({ table: feedbacks, events: uow }),
    outbox: () => Promise.resolve(outbox.values()),
    dispose: () => Promise.resolve(),
  });
}
