import type { BrandId } from '../../../../shared-kernel/ids.js';
import { ok, type Result } from '../../../../shared-kernel/result.js';
import {
  KeyCursor,
  type InvalidKeyCursor,
} from '../../domain/paging/key-cursor.js';
import {
  PageSize,
  type InvalidPageSize,
} from '../../domain/paging/page-size.js';
import type {
  ReportedBranch,
  ReportingQueries,
} from '../ports/reporting-queries.js';

export interface ListBranchesQuery {
  /** From the token, never from the request (FR-B2B-08). */
  readonly brandId: BrandId;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface BranchPage {
  readonly items: readonly ReportedBranch[];
  readonly nextCursor: string | null;
}

/** GET /v1/b2b/branches (FR-B2B-02): the brand's own branches, ordered by id, cursor-paged. */
export class ListBranches {
  constructor(
    private readonly deps: { readonly reporting: ReportingQueries },
  ) {}

  async execute(
    query: ListBranchesQuery,
  ): Promise<Result<BranchPage, InvalidPageSize | InvalidKeyCursor>> {
    const limit = PageSize.parse(query.limit);
    if (!limit.ok) return limit;
    const after =
      query.cursor === undefined ? undefined : KeyCursor.decode(query.cursor);
    if (after !== undefined && !after.ok) return after;
    const rows = await this.deps.reporting.branchesOf(query.brandId, {
      afterId: after?.value,
      limit: limit.value + 1,
    });
    const items = rows.slice(0, limit.value);
    const last = items.at(-1);
    return ok({
      items,
      nextCursor:
        rows.length > limit.value && last !== undefined
          ? KeyCursor.encode(last.id)
          : null,
    });
  }
}
