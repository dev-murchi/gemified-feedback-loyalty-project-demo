import type { Clock } from '../../../../shared-kernel/clock.js';
import { BranchId, type BrandId } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { LabelSetProvider } from '../../../catalog/public/label-set-provider.js';
import { NOT_FOUND, type ResourceNotFound } from '../../domain/not-found.js';
import {
  REPORTABLE_STATUSES,
  type ReportedSentiment,
} from '../../domain/reported-feedback.js';
import { tally } from '../../domain/summary/feedback-tally.js';
import {
  TimeRange,
  type InvalidTimeRange,
  type TimeRangeQuery,
} from '../../domain/time-range/time-range.js';
import type { ReportingQueries } from '../ports/reporting-queries.js';
import { topicNamesFor, type NamedTopic } from '../topic-names.js';

export interface GetBranchSummaryDeps {
  readonly reporting: ReportingQueries;
  readonly labelSets: LabelSetProvider;
  readonly clock: Clock;
}

export interface GetBranchSummaryQuery extends TimeRangeQuery {
  readonly brandId: BrandId;
  /** The path parameter as received. */
  readonly branchId: string;
}

/** The contract's `BranchSummary`. */
export interface BranchSummaryView {
  readonly branchId: string;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly totalFeedbacks: number;
  readonly complaintCount: number;
  readonly unanalyzedCount: number;
  readonly sentimentDistribution: Readonly<Record<ReportedSentiment, number>>;
  readonly topTopics: readonly (NamedTopic & { readonly count: number })[];
}

/**
 * GET /v1/b2b/branches/{id}/summary (FR-B2B-04): sentiment distribution, the five most frequent
 * topics and the complaint count of one branch and period. Spam is never counted; another brand's
 * branch, an unknown and a malformed id are all 404.
 */
export class GetBranchSummary {
  constructor(private readonly deps: GetBranchSummaryDeps) {}

  async execute(
    query: GetBranchSummaryQuery,
  ): Promise<Result<BranchSummaryView, InvalidTimeRange | ResourceNotFound>> {
    const range = TimeRange.parse(query, this.deps.clock.now());
    if (!range.ok) return range;
    const branchId = BranchId.create(query.branchId);
    if (!branchId.ok) return err(NOT_FOUND);
    const branch = await this.deps.reporting.branchOf(
      query.brandId,
      branchId.value,
    );
    if (branch === undefined) return err(NOT_FOUND);
    const facts = await this.deps.reporting.feedbacks({
      brandId: query.brandId,
      statuses: REPORTABLE_STATUSES,
      from: range.value.from,
      to: range.value.to,
      branchId: branch.id,
    });
    const counts = tally(facts);
    const nameOf = await topicNamesFor(this.deps, query.brandId);
    return ok({
      branchId: branch.id,
      from: range.value.fromIso,
      to: range.value.toIso,
      timeZone: range.value.timeZone,
      totalFeedbacks: counts.total,
      complaintCount: counts.complaints,
      unanalyzedCount: counts.unanalyzed,
      sentimentDistribution: counts.sentiments,
      topTopics: counts.topTopics.map((topic) => ({
        ...nameOf(topic.key),
        count: topic.count,
      })),
    });
  }
}
