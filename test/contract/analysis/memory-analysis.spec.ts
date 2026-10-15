// Runs the Analysis repository contract against the in-memory adapter. S0-11 adds the same call
// with a PostgreSQL harness under test/integration/.

import { memoryAnalysisHarness } from '../../support/memory-analysis.js';
import { feedbackAnalysisRepositoryContract } from './feedback-analysis-repository.contract.js';

describe('FeedbackAnalysisRepository (in-memory)', () => {
  feedbackAnalysisRepositoryContract(memoryAnalysisHarness);
});
