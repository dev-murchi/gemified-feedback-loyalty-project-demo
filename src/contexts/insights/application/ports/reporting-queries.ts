import type {
  BranchId,
  BrandId,
  FeedbackId,
} from '../../../../shared-kernel/ids.js';
import type { CatalogSector } from '../../../catalog/public/catalog-sector.js';
import type { CursorPosition } from '../../domain/paging/cursor.js';
import type {
  ReportedSentiment,
  ReportedStatus,
} from '../../domain/reported-feedback.js';

export interface ReportedBranch {
  readonly id: BranchId;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** A feedback as brands may see it: the masked text only, nothing that identifies the user (FR-B2B-06). */
export interface ReportedFeedback {
  readonly id: FeedbackId;
  readonly branchId: BranchId;
  readonly submittedAt: Date;
  readonly status: ReportedStatus;
  readonly textMasked: string | null;
  readonly sentiment: ReportedSentiment | null;
  readonly topicKey: string | null;
}

/** One read of a brand's feedback; the caller decides which statuses may be seen. */
export interface FeedbackQuery {
  readonly brandId: BrandId;
  readonly statuses: readonly ReportedStatus[];
  /** Submitted at or after `from` and before `to`. */
  readonly from: Date;
  readonly to: Date;
  readonly branchId?: BranchId | undefined;
  readonly sentiment?: ReportedSentiment | undefined;
  readonly topicKey?: string | undefined;
  /** Only feedback after this position in newest-first order (keyset paging). */
  readonly after?: CursorPosition | undefined;
  /** At most this many; all of them when absent. */
  readonly limit?: number | undefined;
}

/**
 * The read model of Insights (docs/06 §3, §5.6): the deliberate exception that reads other
 * contexts' stored data, read-only (ADR-003). Every read is bound to one brand; business rules
 * (what is reportable, what is a complaint) stay in the Insights domain, not in these queries.
 */
export interface ReportingQueries {
  sectorOf(brandId: BrandId): Promise<CatalogSector | undefined>;
  /** The brand's branches ordered by id, after `afterId`, at most `limit`. */
  branchesOf(
    brandId: BrandId,
    page: {
      readonly afterId?: string | undefined;
      readonly limit?: number | undefined;
    },
  ): Promise<ReportedBranch[]>;
  /** The branch if it belongs to the brand; another brand's branch is undefined (FR-B2B-08). */
  branchOf(
    brandId: BrandId,
    branchId: BranchId,
  ): Promise<ReportedBranch | undefined>;
  /** Newest first, the id breaking ties (descending). */
  feedbacks(query: FeedbackQuery): Promise<ReportedFeedback[]>;
}
