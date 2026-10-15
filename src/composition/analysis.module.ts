import { Module } from '@nestjs/common';
import { MemoryFeedbackAnalysisRepository } from '../contexts/analysis/adapters/outbound/memory-feedback-analysis.repository.js';
import { NoBudgetGuard } from '../contexts/analysis/adapters/outbound/no-budget-guard.js';
import type { FeedbackAnalysisRepository } from '../contexts/analysis/application/ports/feedback-analysis-repository.js';
import type { SentimentAnalyzer } from '../contexts/analysis/application/ports/sentiment-analyzer.js';
import { ProcessAnalysisJob } from '../contexts/analysis/application/use-cases/process-analysis-job.js';
import { ReportUnanalyzed } from '../contexts/analysis/application/use-cases/report-unanalyzed.js';
import { PiiMasker } from '../contexts/analysis/domain/masking/pii-masker.js';
import { DEFAULT_PRE_CHECK_RULES } from '../contexts/analysis/domain/pre-check/pre-check-rules.js';
import { PreChecks } from '../contexts/analysis/domain/pre-check/pre-checks.js';
import { RetryPolicy } from '../contexts/analysis/domain/retry/retry-policy.js';
import type { LabelSetProvider } from '../contexts/catalog/public/label-set-provider.js';
import type { RawTextSource } from '../contexts/feedback/public/raw-text-source.js';
import type { Logger } from '../shared-kernel/logger.js';
import { CatalogModule } from './catalog.module.js';
import { FeedbackModule } from './feedback.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import { sentimentAnalyzerFor } from './sentiment-analyzer-driver.js';
import {
  FEEDBACK_ANALYSIS_REPOSITORY,
  IN_MEMORY_STORE,
  LABEL_SET_PROVIDER,
  LOGGER,
  PROCESS_ANALYSIS_JOB,
  RAW_TEXT_SOURCE,
  SENTIMENT_ANALYZER,
  UNANALYZED_REPORT,
} from './tokens.js';

/**
 * Analysis wiring (in-memory until S0-11). The provider comes from LLM_DRIVER. ProcessAnalysisJob
 * is run by the worker from the queue (S0-10); UnanalyzedReport is used by the 24-hour sweeper
 * (S0-10), which is wired outside Feedback and Analysis so neither module imports the other twice.
 * The demo has no budget guard (SDD 11.1).
 */
@Module({
  imports: [CatalogModule, FeedbackModule],
  providers: [
    {
      provide: FEEDBACK_ANALYSIS_REPOSITORY,
      inject: [IN_MEMORY_STORE],
      useFactory: (store: InMemoryStore) =>
        new MemoryFeedbackAnalysisRepository({
          table: store.analysis.analyses,
          events: store.uow,
        }),
    },
    {
      provide: SENTIMENT_ANALYZER,
      inject: [LOGGER],
      useFactory: (logger: Logger) => sentimentAnalyzerFor(process.env, logger),
    },
    {
      provide: PROCESS_ANALYSIS_JOB,
      inject: [
        FEEDBACK_ANALYSIS_REPOSITORY,
        RAW_TEXT_SOURCE,
        LABEL_SET_PROVIDER,
        SENTIMENT_ANALYZER,
        IN_MEMORY_STORE,
      ],
      useFactory: (
        ...[analyses, rawTexts, labelSets, analyzer, store]: [
          FeedbackAnalysisRepository,
          RawTextSource,
          LabelSetProvider,
          SentimentAnalyzer,
          InMemoryStore,
        ]
      ) =>
        new ProcessAnalysisJob({
          analyses,
          rawTexts,
          labelSets,
          analyzer,
          preChecks: new PreChecks(DEFAULT_PRE_CHECK_RULES),
          masker: new PiiMasker(),
          retries: new RetryPolicy(),
          uow: store.uow,
          clock: store.clock,
        }),
    },
    {
      provide: UNANALYZED_REPORT,
      inject: [FEEDBACK_ANALYSIS_REPOSITORY],
      useFactory: (analyses: FeedbackAnalysisRepository) =>
        new ReportUnanalyzed({ analyses, budget: new NoBudgetGuard() }),
    },
  ],
  exports: [PROCESS_ANALYSIS_JOB, UNANALYZED_REPORT],
})
export class AnalysisModule {}
