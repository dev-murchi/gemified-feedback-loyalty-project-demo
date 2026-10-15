import type { Clock } from '../../../../shared-kernel/clock.js';
import type { BrandId } from '../../../../shared-kernel/ids.js';
import { ok, type Result } from '../../../../shared-kernel/result.js';
import { REPORTABLE_STATUSES } from '../../domain/reported-feedback.js';
import { tally } from '../../domain/summary/feedback-tally.js';
import {
  TimeRange,
  type InvalidTimeRange,
  type TimeRangeQuery,
} from '../../domain/time-range/time-range.js';
import type {
  ReportedFeedback,
  ReportingQueries,
} from '../ports/reporting-queries.js';

export interface GetHeatmapQuery extends TimeRangeQuery {
  readonly brandId: BrandId;
}

/** The contract's `Heatmap`. */
export interface HeatmapView {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly items: readonly {
    readonly branchId: string;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
    readonly feedbackCount: number;
    readonly complaintCount: number;
  }[];
}

const byBranch = (
  rows: readonly ReportedFeedback[],
): Map<string, ReportedFeedback[]> => {
  const groups = new Map<string, ReportedFeedback[]>();
  for (const row of rows)
    groups.set(row.branchId, [...(groups.get(row.branchId) ?? []), row]);
  return groups;
};

/**
 * GET /v1/b2b/heatmap (FR-B2B-05): every branch of the brand with its coordinates and the period's
 * feedback and complaint counts, counted with the same rules as the summary (spam never counted).
 */
export class GetHeatmap {
  constructor(
    private readonly deps: {
      readonly reporting: ReportingQueries;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    query: GetHeatmapQuery,
  ): Promise<Result<HeatmapView, InvalidTimeRange>> {
    const range = TimeRange.parse(query, this.deps.clock.now());
    if (!range.ok) return range;
    const branches = await this.deps.reporting.branchesOf(query.brandId, {});
    const groups = byBranch(
      await this.deps.reporting.feedbacks({
        brandId: query.brandId,
        statuses: REPORTABLE_STATUSES,
        from: range.value.from,
        to: range.value.to,
      }),
    );
    return ok({
      from: range.value.fromIso,
      to: range.value.toIso,
      timeZone: range.value.timeZone,
      items: branches.map((branch) => {
        const counts = tally(groups.get(branch.id) ?? []);
        return {
          branchId: branch.id,
          name: branch.name,
          lat: branch.lat,
          lng: branch.lng,
          feedbackCount: counts.total,
          complaintCount: counts.complaints,
        };
      }),
    });
  }
}
