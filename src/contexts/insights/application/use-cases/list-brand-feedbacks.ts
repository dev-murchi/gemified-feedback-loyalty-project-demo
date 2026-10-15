import type { Clock } from '../../../../shared-kernel/clock.js';
import { BranchId, type BrandId } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { LabelSetProvider } from '../../../catalog/public/label-set-provider.js';
import { NOT_FOUND, type ResourceNotFound } from '../../domain/not-found.js';
import {
  Cursor,
  type CursorPosition,
  type InvalidCursor,
} from '../../domain/paging/cursor.js';
import {
  PageSize,
  type InvalidPageSize,
} from '../../domain/paging/page-size.js';
import {
  REPORTABLE_STATUSES,
  type ReportedSentiment,
} from '../../domain/reported-feedback.js';
import {
  TimeRange,
  type InvalidTimeRange,
  type TimeRangeQuery,
} from '../../domain/time-range/time-range.js';
import type {
  ReportedFeedback,
  ReportingQueries,
} from '../ports/reporting-queries.js';
import { topicNamesFor, type NamedTopic } from '../topic-names.js';

export interface ListBrandFeedbacksDeps {
  readonly reporting: ReportingQueries;
  readonly labelSets: LabelSetProvider;
  readonly clock: Clock;
}

export interface ListBrandFeedbacksQuery extends TimeRangeQuery {
  readonly brandId: BrandId;
  readonly branchId?: string | undefined;
  readonly sentiment?: ReportedSentiment | undefined;
  readonly topicKey?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

/** The contract's `BrandFeedback`: masked text only, nothing about the user (FR-B2B-06, FR-B2B-07). */
export interface BrandFeedbackView {
  readonly id: string;
  readonly branchId: string;
  readonly submittedAt: Date;
  readonly status: 'valid' | 'unanalyzed';
  readonly textMasked: string | null;
  readonly sentiment: ReportedSentiment | null;
  readonly topic: NamedTopic | null;
}

export interface BrandFeedbackPage {
  readonly items: readonly BrandFeedbackView[];
  readonly nextCursor: string | null;
}

/** A `branchId` filter that is not a UUID (another brand's branch is 404, not this). */
export interface InvalidBranchId {
  readonly code: 'VALIDATION_ERROR';
  readonly field: 'branchId';
}

export type ListBrandFeedbacksError =
  | InvalidTimeRange
  | InvalidPageSize
  | InvalidCursor
  | ResourceNotFound
  | InvalidBranchId;

interface Checked {
  readonly range: TimeRange;
  readonly limit: number;
  readonly after: CursorPosition | undefined;
  readonly branchId: BranchId | undefined;
}

/** An absent optional parameter is fine; a present one must parse. */
const optional = <T, E>(
  value: string | undefined,
  parse: (raw: string) => Result<T, E>,
): Result<T | undefined, E> =>
  value === undefined ? ok(undefined) : parse(value);

const parseBranchId = (raw: string): Result<BranchId, InvalidBranchId> => {
  const id = BranchId.create(raw);
  return id.ok ? id : err({ code: 'VALIDATION_ERROR', field: 'branchId' });
};

const toView =
  (nameOf: (key: string) => NamedTopic) =>
  (row: ReportedFeedback): BrandFeedbackView => ({
    id: row.id,
    branchId: row.branchId,
    submittedAt: row.submittedAt,
    status: row.status === 'valid' ? 'valid' : 'unanalyzed',
    textMasked: row.textMasked,
    sentiment: row.sentiment,
    topic: row.topicKey === null ? null : nameOf(row.topicKey),
  });

/**
 * GET /v1/b2b/feedbacks (FR-B2B-03): the brand's valid and unanalyzed feedback, newest first, with
 * keyset paging, filtered by branch, period, sentiment and topic. A branch of another brand is 404.
 */
export class ListBrandFeedbacks {
  constructor(private readonly deps: ListBrandFeedbacksDeps) {}

  async execute(
    query: ListBrandFeedbacksQuery,
  ): Promise<Result<BrandFeedbackPage, ListBrandFeedbacksError>> {
    const checked = this.#check(query);
    if (!checked.ok) return checked;
    const { range, limit, after, branchId } = checked.value;
    if (branchId !== undefined) {
      const branch = await this.deps.reporting.branchOf(
        query.brandId,
        branchId,
      );
      if (branch === undefined) return err(NOT_FOUND);
    }
    const rows = await this.deps.reporting.feedbacks({
      brandId: query.brandId,
      statuses: REPORTABLE_STATUSES,
      from: range.from,
      to: range.to,
      branchId,
      sentiment: query.sentiment,
      topicKey: query.topicKey,
      after,
      limit: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const nameOf = await topicNamesFor(this.deps, query.brandId);
    return ok({
      items: items.map(toView(nameOf)),
      nextCursor:
        rows.length > limit && last !== undefined
          ? Cursor.encode({ submittedAt: last.submittedAt, id: last.id })
          : null,
    });
  }

  #check(
    query: ListBrandFeedbacksQuery,
  ): Result<Checked, ListBrandFeedbacksError> {
    const range = TimeRange.parse(query, this.deps.clock.now());
    if (!range.ok) return range;
    const limit = PageSize.parse(query.limit);
    if (!limit.ok) return limit;
    const after = optional(query.cursor, (raw) => Cursor.decode(raw));
    if (!after.ok) return after;
    const branchId = optional(query.branchId, parseBranchId);
    if (!branchId.ok) return branchId;
    return ok({
      range: range.value,
      limit: limit.value,
      after: after.value,
      branchId: branchId.value,
    });
  }
}
