import { createSecretKey, randomBytes } from 'node:crypto';
import {
  MemoryFeedbackAnalysisRepository,
  type FeedbackAnalysisRow,
} from '../../src/contexts/analysis/adapters/outbound/memory-feedback-analysis.repository.js';
import { ProcessAnalysisJob } from '../../src/contexts/analysis/application/use-cases/process-analysis-job.js';
import { ReportUnanalyzed } from '../../src/contexts/analysis/application/use-cases/report-unanalyzed.js';
import { PiiMasker } from '../../src/contexts/analysis/domain/masking/pii-masker.js';
import { DEFAULT_PRE_CHECK_RULES } from '../../src/contexts/analysis/domain/pre-check/pre-check-rules.js';
import { PreChecks } from '../../src/contexts/analysis/domain/pre-check/pre-checks.js';
import { RetryPolicy } from '../../src/contexts/analysis/domain/retry/retry-policy.js';
import type { LabelSetProvider } from '../../src/contexts/catalog/public/label-set-provider.js';
import { LocalRawTextCipher } from '../../src/contexts/feedback/adapters/outbound/local-raw-text.cipher.js';
import {
  MemoryFeedbackRepository,
  type FeedbackRow,
} from '../../src/contexts/feedback/adapters/outbound/memory-feedback.repository.js';
import {
  MemoryRewardCooldownRepository,
  type RewardCooldownRow,
} from '../../src/contexts/feedback/adapters/outbound/memory-reward-cooldown.repository.js';
import { NodeHasher } from '../../src/contexts/feedback/adapters/outbound/node-hasher.js';
import { ApplyAnalysisResult } from '../../src/contexts/feedback/application/use-cases/apply-analysis-result.js';
import { FinalizeUnanalyzedFeedback } from '../../src/contexts/feedback/application/use-cases/finalize-unanalyzed-feedback.js';
import { ReadRawText } from '../../src/contexts/feedback/application/use-cases/read-raw-text.js';
import { SubmitFeedback } from '../../src/contexts/feedback/application/use-cases/submit-feedback.js';
import { DEFAULT_REWARD_LIMITS } from '../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import type { FeedbackValidated } from '../../src/contexts/feedback/public/feedback-validated.js';
import { CryptoRandomSource } from '../../src/shared-kernel/adapters/crypto-random-source.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import { FakeClock } from './fake-clock.js';
import { T0 } from './feedback-builders.js';
import { fakeProofs, fakeQrResolver } from './feedback-fakes.js';
import {
  fakeSentimentAnalyzer,
  type FakeSentimentAnalyzer,
} from './fake-sentiment-analyzer.js';
import { RecordingLogger } from './recording-logger.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** The fuel topics the fake Catalog hands Analysis, at label-set version 3. */
export const FUEL_TOPICS = [
  { key: 'pump', name: 'Pompa' },
  { key: 'toilet_cleanliness', name: 'Tuvalet temizliği' },
  { key: 'other', name: 'Diğer' },
];

const fakeLabelSets = (): LabelSetProvider => ({
  current: (sector) =>
    Promise.resolve({ sector, version: 3, topics: FUEL_TOPICS }),
});

/**
 * Feedback and Analysis on in-memory adapters sharing one unit of work, with the real event routes
 * between them (FeedbackAnalyzed → ApplyAnalysisResult in the same transaction) and fakes at the
 * edges: the QR resolver, the platform proof, the label sets and the LLM.
 */
export interface AnalysisFixture {
  readonly clock: FakeClock;
  readonly analyzer: FakeSentimentAnalyzer;
  readonly submit: SubmitFeedback;
  readonly job: ProcessAnalysisJob;
  readonly finalize: FinalizeUnanalyzedFeedback;
  readonly feedbacks: MemoryFeedbackRepository;
  readonly analyses: MemoryFeedbackAnalysisRepository;
  readonly validated: FeedbackValidated[];
}

export function analysisFixture(): AnalysisFixture {
  const clock = new FakeClock(T0);
  const tables = {
    feedbacks: new InMemoryTable<string, FeedbackRow>(),
    cooldowns: new InMemoryTable<string, RewardCooldownRow>(),
    analyses: new InMemoryTable<string, FeedbackAnalysisRow>(),
  };
  const validated: FeedbackValidated[] = [];
  const routes: Parameters<typeof fixedRoutes>[0] = {};
  const uow = new InMemoryUnitOfWork({
    routes: fixedRoutes(routes),
    tables: Object.values(tables),
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock,
    ids: new SequentialIdGenerator(),
  });
  const feedbacks = new MemoryFeedbackRepository({
    table: tables.feedbacks,
    events: uow,
  });
  const cooldowns = new MemoryRewardCooldownRepository({
    table: tables.cooldowns,
    events: uow,
    limits: DEFAULT_REWARD_LIMITS,
  });
  const analyses = new MemoryFeedbackAnalysisRepository({
    table: tables.analyses,
    events: uow,
  });
  Object.assign(routes, {
    FeedbackSubmitted: { outbox: true },
    FeedbackAnalyzed: {
      sync: [new ApplyAnalysisResult({ feedbacks, cooldowns })],
    },
    FeedbackValidated: {
      sync: [
        {
          handle: (event: FeedbackValidated) => (
            validated.push(event),
            Promise.resolve()
          ),
        },
      ],
    },
  });
  const random = new CryptoRandomSource();
  const cipher = new LocalRawTextCipher({
    masterKey: { key: createSecretKey(randomBytes(32)), keyId: 'test' },
    random,
  });
  const analyzer = fakeSentimentAnalyzer();
  return {
    clock,
    analyzer,
    feedbacks,
    analyses,
    validated,
    submit: new SubmitFeedback({
      feedbacks,
      cooldowns,
      limits: DEFAULT_REWARD_LIMITS,
      qrCodes: fakeQrResolver(),
      proofs: fakeProofs(),
      cipher,
      hasher: new NodeHasher(),
      uow,
      ids: new SequentialIdGenerator(),
      clock,
      logger: new RecordingLogger(),
    }),
    job: new ProcessAnalysisJob({
      analyses,
      rawTexts: new ReadRawText({ feedbacks, cipher }),
      labelSets: fakeLabelSets(),
      analyzer,
      preChecks: new PreChecks(DEFAULT_PRE_CHECK_RULES),
      masker: new PiiMasker(),
      retries: new RetryPolicy(),
      uow,
      clock,
    }),
    finalize: new FinalizeUnanalyzedFeedback({
      feedbacks,
      cooldowns,
      report: new ReportUnanalyzed({
        analyses,
        budget: { isOn: () => Promise.resolve(false) },
      }),
      uow,
      clock,
    }),
  };
}
