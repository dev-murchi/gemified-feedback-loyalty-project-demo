import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface InvalidPageSize extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'limit';
}

/** The `limit` query parameter: 1–100, 20 when absent (docs/api/openapi.yaml `Limit`). */
export const PageSize = {
  parse(limit: number | undefined): Result<number, InvalidPageSize> {
    if (limit === undefined) return ok(DEFAULT_PAGE_SIZE);
    return Number.isInteger(limit) && limit >= 1 && limit <= MAX_PAGE_SIZE
      ? ok(limit)
      : err({ code: 'VALIDATION_ERROR', field: 'limit' });
  },
};
