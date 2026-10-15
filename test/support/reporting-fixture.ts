import type { ReportingQueries } from '../../src/contexts/insights/application/ports/reporting-queries.js';
import { GetBranchSummary } from '../../src/contexts/insights/application/use-cases/get-branch-summary.js';
import { GetHeatmap } from '../../src/contexts/insights/application/use-cases/get-heatmap.js';
import { ListBrandFeedbacks } from '../../src/contexts/insights/application/use-cases/list-brand-feedbacks.js';
import { ListBranches } from '../../src/contexts/insights/application/use-cases/list-branches.js';
import { ListTopics } from '../../src/contexts/insights/application/use-cases/list-topics.js';
import type {
  ReportedSentiment,
  ReportedStatus,
} from '../../src/contexts/insights/domain/reported-feedback.js';
import type { LabelSetProvider } from '../../src/contexts/catalog/public/label-set-provider.js';
import {
  createInMemoryStore,
  type InMemoryStore,
} from '../../src/composition/in-memory-store.js';
import { MemoryReportingQueries } from '../../src/composition/memory-reporting-queries.js';
import { fixedRoutes } from '../../src/shared-kernel/event-routing.js';
import type {
  BranchId,
  BrandId,
  FeedbackId,
} from '../../src/shared-kernel/ids.js';
import type { MaskedText } from '../../src/contexts/analysis/domain/masking/masked-text.js';
import { FakeClock } from './fake-clock.js';

export const BRAND_A = 'b0000000-0000-4000-8000-00000000000a' as BrandId;
export const BRAND_B = 'b0000000-0000-4000-8000-00000000000b' as BrandId;
export const BRANCH_A1 = 'c0000000-0000-4000-8000-0000000000a1' as BranchId;
export const BRANCH_A2 = 'c0000000-0000-4000-8000-0000000000a2' as BranchId;
export const BRANCH_B1 = 'c0000000-0000-4000-8000-0000000000b1' as BranchId;
/** The report's "now"; seeded feedback lies in the days before it. */
export const REPORT_NOW = new Date('2026-10-16T09:00:00.000Z');

const FUEL_TOPICS = [
  { key: 'toilet_cleanliness', name: 'Tuvalet temizliği' },
  { key: 'wait_time', name: 'Bekleme süresi' },
  { key: 'staff_attitude', name: 'Personel tutumu' },
  { key: 'price', name: 'Fiyat' },
  { key: 'pump_equipment', name: 'Pompa/ekipman' },
  { key: 'other', name: 'Diğer' },
];

export interface SeededFeedback {
  readonly id: string;
  readonly branchId: BranchId;
  readonly submittedAt: Date;
  readonly status: ReportedStatus;
  readonly maskedText?: string | null;
  readonly sentiment?: ReportedSentiment;
  readonly topicKey?: string;
}

export interface ReportingFixture {
  readonly store: InMemoryStore;
  readonly clock: FakeClock;
  readonly reporting: ReportingQueries;
  readonly listBranches: ListBranches;
  readonly listFeedbacks: ListBrandFeedbacks;
  readonly summary: GetBranchSummary;
  readonly heatmap: GetHeatmap;
  readonly topics: ListTopics;
  /** Writes a feedback row (and its analysis row, if it has labels) straight into the store. */
  addFeedback(feedback: SeededFeedback): void;
}

const branchRow = (
  brandId: BrandId,
  branch: {
    readonly id: BranchId;
    readonly name: string;
    readonly lat: number;
  },
) => ({
  ...branch,
  brandId,
  lng: 29,
  qrCodes: [],
  version: 1,
});

/** Feedback ids f…0001, f…0002, …, ordered like their numbers. */
export const fid = (n: number): string =>
  `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Brand A (fuel) with two branches and brand B with one, read through MemoryReportingQueries. */
export function reportingFixture(): ReportingFixture {
  const clock = new FakeClock(REPORT_NOW);
  const store = createInMemoryStore(fixedRoutes({}), clock);
  store.catalog.brands.set(BRAND_A, {
    id: BRAND_A,
    name: 'Örnek Petrol',
    sector: 'fuel',
    version: 1,
  });
  store.catalog.brands.set(BRAND_B, {
    id: BRAND_B,
    name: 'Rakip Petrol',
    sector: 'fuel',
    version: 1,
  });
  store.catalog.branches.set(
    BRANCH_A2,
    branchRow(BRAND_A, { id: BRANCH_A2, name: 'Kadıköy', lat: 40.99 }),
  );
  store.catalog.branches.set(
    BRANCH_A1,
    branchRow(BRAND_A, { id: BRANCH_A1, name: 'Beşiktaş', lat: 41.04 }),
  );
  store.catalog.branches.set(
    BRANCH_B1,
    branchRow(BRAND_B, { id: BRANCH_B1, name: 'Rakip Şube', lat: 41.0 }),
  );
  const reporting = new MemoryReportingQueries(store);
  const labelSets: LabelSetProvider = {
    current: (sector) =>
      Promise.resolve({ sector, version: 2, topics: FUEL_TOPICS }),
  };
  return {
    store,
    clock,
    reporting,
    listBranches: new ListBranches({ reporting }),
    listFeedbacks: new ListBrandFeedbacks({ reporting, labelSets, clock }),
    summary: new GetBranchSummary({ reporting, labelSets, clock }),
    heatmap: new GetHeatmap({ reporting, clock }),
    topics: new ListTopics({ reporting, labelSets }),
    addFeedback: (feedback) => seed(store, feedback),
  };
}

function seed(store: InMemoryStore, feedback: SeededFeedback): void {
  store.feedback.feedbacks.set(feedback.id, {
    id: feedback.id,
    userId: 'a0000000-0000-4000-8000-0000000000aa',
    branchId: feedback.branchId,
    qrCodeId: 'd0000000-0000-4000-8000-0000000000a1',
    idempotencyKey: feedback.id,
    requestFingerprint: 'a'.repeat(64),
    status: feedback.status,
    rewardEligible: true,
    correlationId: 'req',
    submittedAt: feedback.submittedAt,
    analyzedAt: null,
    maskedText:
      feedback.maskedText === undefined ? 'Maskeli yorum' : feedback.maskedText,
    rawText: {
      ciphertext: 'c',
      encryptedDataKey: 'k',
      keyId: 'test',
      retainUntil: new Date('2028-10-16'),
    },
    version: 1,
  });
  if (feedback.sentiment === undefined) return;
  store.analysis.analyses.set(feedback.id, {
    feedbackId: feedback.id as FeedbackId,
    submittedAt: feedback.submittedAt,
    attempts: 0,
    nextAttemptAt: null,
    lastFailure: null,
    maskedText: 'Maskeli yorum' as MaskedText,
    result: {
      source: 'llm',
      verdict: {
        sentiment: feedback.sentiment,
        topicKey: feedback.topicKey ?? 'other',
        isValid: feedback.status !== 'spam',
        spamReason: feedback.status === 'spam' ? 'advertisement' : null,
      },
      provenance: {
        model: 'm',
        promptVersion: 'p',
        labelSetVersion: 2,
        inputTokens: 1,
        outputTokens: 1,
      },
      maskedText: 'Maskeli yorum' as MaskedText,
      analyzedAt: feedback.submittedAt,
    },
    version: 1,
  });
}
