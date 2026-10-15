import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type {
  UnanalyzedFindings,
  UnanalyzedReport,
} from '../../public/unanalyzed-report.js';
import type { BudgetGuard } from '../ports/budget-guard.js';
import type { FeedbackAnalysisRepository } from '../ports/feedback-analysis-repository.js';

export interface ReportUnanalyzedDeps {
  readonly analyses: FeedbackAnalysisRepository;
  readonly budget: BudgetGuard;
}

/** A feedback Analysis has no record of was never attempted: nothing known, no reward. */
const NOTHING_KNOWN: UnanalyzedFindings = {
  maskedText: null,
  rewardAllowed: false,
};

/** Implements the UnanalyzedReport open host service (FR-AI-09, SRS CR-007). Read-only. */
export class ReportUnanalyzed implements UnanalyzedReport {
  constructor(private readonly deps: ReportUnanalyzedDeps) {}

  async findingsFor(feedbackId: FeedbackId): Promise<UnanalyzedFindings> {
    const analysis = await this.deps.analyses.find(feedbackId);
    if (analysis === undefined) return NOTHING_KNOWN;
    return analysis.findings(await this.deps.budget.isOn());
  }
}
