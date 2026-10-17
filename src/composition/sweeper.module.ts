import { Module } from '@nestjs/common';
import type { UnanalyzedReport } from '../contexts/analysis/public/unanalyzed-report.js';
import type { FeedbackRepository } from '../contexts/feedback/application/ports/feedback-repository.js';
import type { RewardCooldownRepository } from '../contexts/feedback/application/ports/reward-cooldown-repository.js';
import { FinalizeUnanalyzedFeedback } from '../contexts/feedback/application/use-cases/finalize-unanalyzed-feedback.js';
import { SweepUnanalyzedFeedback } from '../contexts/feedback/application/use-cases/sweep-unanalyzed-feedback.js';
import { AnalysisModule } from './analysis.module.js';
import { FeedbackModule } from './feedback.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
  FEEDBACK_REPOSITORY,
  IN_MEMORY_STORE,
  REWARD_COOLDOWN_REPOSITORY,
  SWEEP_UNANALYZED,
  UNANALYZED_REPORT,
} from './tokens.js';

/**
 * The 24-hour sweeper (FR-AI-09). It needs Feedback (to close) and Analysis (to know whether a
 * reward is allowed), so it is wired here, outside both modules: Analysis already imports Feedback
 * for RawTextSource, and Feedback importing Analysis back would be a cycle.
 */
@Module({
  imports: [FeedbackModule, AnalysisModule],
  providers: [
    {
      provide: SWEEP_UNANALYZED,
      inject: [
        FEEDBACK_REPOSITORY,
        REWARD_COOLDOWN_REPOSITORY,
        UNANALYZED_REPORT,
        IN_MEMORY_STORE,
      ],
      useFactory: (
        ...[feedbacks, cooldowns, report, store]: [
          FeedbackRepository,
          RewardCooldownRepository,
          UnanalyzedReport,
          InMemoryStore,
        ]
      ) =>
        new SweepUnanalyzedFeedback({
          feedbacks,
          clock: store.clock,
          finalize: new FinalizeUnanalyzedFeedback({
            feedbacks,
            cooldowns,
            report,
            uow: store.uow,
            clock: store.clock,
          }),
        }),
    },
  ],
  exports: [SWEEP_UNANALYZED],
})
export class SweeperModule {}
