import {
  MemoryFeedbackAnalysisRepository,
  type FeedbackAnalysisRow,
} from '../../src/contexts/analysis/adapters/outbound/memory-feedback-analysis.repository.js';
import type { FeedbackAnalysisRepository } from '../../src/contexts/analysis/application/ports/feedback-analysis-repository.js';
import type { FeedbackAnalyzed } from '../../src/contexts/analysis/public/feedback-analyzed.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import type { UnitOfWork } from '../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from './fake-clock.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** Everything an Analysis repository test needs; the PostgreSQL harness (S0-11) has the same shape. */
export interface AnalysisHarness {
  readonly uow: UnitOfWork;
  readonly analyses: FeedbackAnalysisRepository;
  /** FeedbackAnalyzed events delivered by committed and rolled-back units of work alike. */
  readonly analyzed: FeedbackAnalyzed[];
  dispose(): Promise<void>;
}

export function memoryAnalysisHarness(): Promise<AnalysisHarness> {
  const table = new InMemoryTable<string, FeedbackAnalysisRow>();
  const analyzed: FeedbackAnalyzed[] = [];
  const recordAnalyzed = {
    handle: (event: FeedbackAnalyzed) => {
      analyzed.push(event);
      return Promise.resolve();
    },
  };
  const uow = new InMemoryUnitOfWork({
    routes: fixedRoutes({ FeedbackAnalyzed: { sync: [recordAnalyzed] } }),
    tables: [table],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  return Promise.resolve({
    uow,
    analyses: new MemoryFeedbackAnalysisRepository({ table, events: uow }),
    analyzed,
    dispose: () => Promise.resolve(),
  });
}
