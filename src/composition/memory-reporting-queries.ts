import type { FeedbackAnalysisRow } from '../contexts/analysis/adapters/outbound/memory-feedback-analysis.repository.js';
import type { FeedbackRow } from '../contexts/feedback/adapters/outbound/memory-feedback.repository.js';
import type {
  FeedbackQuery,
  ReportedBranch,
  ReportedFeedback,
  ReportingQueries,
} from '../contexts/insights/application/ports/reporting-queries.js';
import { Cursor } from '../contexts/insights/domain/paging/cursor.js';
import type { ReportedSentiment } from '../contexts/insights/domain/reported-feedback.js';
import type { CatalogSector } from '../contexts/catalog/public/catalog-sector.js';
import type { BranchId, BrandId, FeedbackId } from '../shared-kernel/ids.js';
import type { InMemoryStore } from './in-memory-store.js';

type Tables = Pick<InMemoryStore, 'catalog' | 'feedback' | 'analysis'>;

/** The sentiment and topic of an analysis result; none for pre-check spam or no result. */
function labelsOf(row: FeedbackAnalysisRow | undefined): {
  sentiment: ReportedSentiment | null;
  topicKey: string | null;
} {
  const result = row?.result;
  if (result?.source !== 'llm') return { sentiment: null, topicKey: null };
  return {
    sentiment: result.verdict.sentiment,
    topicKey: result.verdict.topicKey,
  };
}

const newestFirst = (a: ReportedFeedback, b: ReportedFeedback): number =>
  b.submittedAt.getTime() - a.submittedAt.getTime() || (a.id < b.id ? 1 : -1);

/** Does a reported feedback pass every filter of the query except the brand and the paging? */
function matches(row: ReportedFeedback, query: FeedbackQuery): boolean {
  const time = row.submittedAt.getTime();
  return (
    query.statuses.includes(row.status) &&
    time >= query.from.getTime() &&
    time < query.to.getTime() &&
    (query.branchId === undefined || row.branchId === query.branchId) &&
    (query.sentiment === undefined || row.sentiment === query.sentiment) &&
    (query.topicKey === undefined || row.topicKey === query.topicKey)
  );
}

/**
 * The in-memory read model of Insights (docs/06 §3, Insights → Feedback, Catalog: conformist read model): it lives in the composition root, the only
 * layer that may see every context's tables, and reads Catalog, Feedback and Analysis rows without
 * writing anything. The PostgreSQL version (S0-11) reads the same tables with plain SQL inside
 * Insights. It applies only the filters it is given; what is reportable is the use cases' decision.
 */
export class MemoryReportingQueries implements ReportingQueries {
  constructor(private readonly tables: Tables) {}

  sectorOf(brandId: BrandId): Promise<CatalogSector | undefined> {
    return Promise.resolve(this.tables.catalog.brands.get(brandId)?.sector);
  }

  branchesOf(
    brandId: BrandId,
    page: {
      readonly afterId?: string | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<ReportedBranch[]> {
    const branches = this.#branches(brandId)
      .filter(
        (branch) => page.afterId === undefined || branch.id > page.afterId,
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    return Promise.resolve(
      page.limit === undefined ? branches : branches.slice(0, page.limit),
    );
  }

  branchOf(
    brandId: BrandId,
    branchId: BranchId,
  ): Promise<ReportedBranch | undefined> {
    return Promise.resolve(
      this.#branches(brandId).find((branch) => branch.id === branchId),
    );
  }

  feedbacks(query: FeedbackQuery): Promise<ReportedFeedback[]> {
    const own = new Set(
      this.#branches(query.brandId).map((branch) => branch.id),
    );
    const rows = this.tables.feedback.feedbacks
      .values()
      .filter((row) => own.has(row.branchId as BranchId))
      .map((row) => this.#reported(row))
      .filter((row) => matches(row, query))
      .filter(
        (row) => query.after === undefined || Cursor.isAfter(row, query.after),
      )
      .sort(newestFirst);
    return Promise.resolve(
      query.limit === undefined ? rows : rows.slice(0, query.limit),
    );
  }

  #branches(brandId: BrandId): ReportedBranch[] {
    return this.tables.catalog.branches
      .values()
      .filter((row) => row.brandId === brandId)
      .map((row) => ({
        id: row.id as BranchId,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
      }));
  }

  /** Only what brands may see: no user id, no raw text, no device data (FR-B2B-06, FR-B2B-07). */
  #reported(row: FeedbackRow): ReportedFeedback {
    return {
      id: row.id as FeedbackId,
      branchId: row.branchId as BranchId,
      submittedAt: row.submittedAt,
      status: row.status,
      textMasked: row.maskedText,
      ...labelsOf(this.tables.analysis.analyses.get(row.id)),
    };
  }
}
