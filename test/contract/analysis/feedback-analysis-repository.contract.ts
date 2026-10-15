import { RetryPolicy } from '../../../src/contexts/analysis/domain/retry/retry-policy.js';
import {
  anAnalysis,
  ANALYZED_ID,
  llmResult,
  MASKED,
  minutesAfter,
} from '../../support/analysis-builders.js';
import type { AnalysisHarness } from '../../support/memory-analysis.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

export function feedbackAnalysisRepositoryContract(
  makeHarness: () => Promise<AnalysisHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => anAnalysis(),
        save: (analysis) => harness.analyses.save(analysis),
        load: () => harness.analyses.find(ANALYZED_ID),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: AnalysisHarness;
    const save = (analysis: ReturnType<typeof anAnalysis>) =>
      harness.uow.run(() => harness.analyses.save(analysis));

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('is not found before the first attempt', async () => {
      expect(await harness.analyses.find(ANALYZED_ID)).toBeUndefined();
    });

    it('loads the retry state exactly as saved', async () => {
      const analysis = anAnalysis();
      analysis.recordFailure(
        {
          kind: 'provider_unavailable',
          at: minutesAfter(0),
          maskedText: MASKED,
        },
        new RetryPolicy(),
      );

      await save(analysis);

      expect((await harness.analyses.find(ANALYZED_ID))?.state).toEqual(
        analysis.state,
      );
    });

    it('loads a completed result exactly as saved, and publishes FeedbackAnalyzed in the same unit of work', async () => {
      const analysis = anAnalysis();
      analysis.complete(llmResult());

      await save(analysis);

      const loaded = await harness.analyses.find(ANALYZED_ID);
      expect(loaded?.state).toEqual(analysis.state);
      expect(loaded?.isCompleted).toBe(true);
      expect(harness.analyzed.map((event) => event.aggregateId)).toEqual([
        ANALYZED_ID,
      ]);
    });
  });
}
