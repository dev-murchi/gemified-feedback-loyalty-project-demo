import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../../shared-kernel/adapters/save-versioned.js';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type { EventCollector } from '../../../../shared-kernel/unit-of-work.js';
import type { FeedbackAnalysisRepository } from '../../application/ports/feedback-analysis-repository.js';
import {
  FeedbackAnalysis,
  type FeedbackAnalysisState,
} from '../../domain/feedback-analysis/feedback-analysis.js';

/**
 * Plain stored analysis; mirrors FEEDBACK_ANALYSES (SDD 6.1). The state is already plain data
 * (dates, strings, numbers), so the row is the state plus its version.
 */
export interface FeedbackAnalysisRow extends FeedbackAnalysisState {
  readonly version: number;
}

export interface MemoryFeedbackAnalysisRepositoryDeps {
  readonly table: InMemoryTable<string, FeedbackAnalysisRow>;
  readonly events: EventCollector;
}

export class MemoryFeedbackAnalysisRepository implements FeedbackAnalysisRepository {
  constructor(private readonly deps: MemoryFeedbackAnalysisRepositoryDeps) {}

  find(feedbackId: FeedbackId): Promise<FeedbackAnalysis | undefined> {
    const row = this.deps.table.get(feedbackId);
    if (row === undefined) return Promise.resolve(undefined);
    const { version, ...state } = row;
    return Promise.resolve(FeedbackAnalysis.reconstitute(state, version));
  }

  save(analysis: FeedbackAnalysis): Promise<void> {
    return saveVersioned(this.deps, analysis, {
      key: analysis.feedbackId,
      toRow: (version) => ({ ...analysis.state, version }),
    });
  }
}
