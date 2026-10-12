import type { z } from 'zod';
import type { FieldError } from './problem-details.js';
import { ProblemException } from './problem-exception.js';

/** Where an issue about the whole body (not one field) is reported. */
const WHOLE_BODY = 'body';

const pathOf = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? WHOLE_BODY : path.map(String).join('.');

/** One FieldError per issue; an unexpected-fields issue names each unexpected field. */
function fieldErrors(issues: readonly z.core.$ZodIssue[]): FieldError[] {
  return issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({
          field: pathOf([...issue.path, key]),
          message: 'unexpected field',
        }))
      : [{ field: pathOf(issue.path), message: issue.message }],
  );
}

/**
 * Format validation at the HTTP edge (docs/07 §6): a body that does not fit its schema ends the
 * request with `VALIDATION_ERROR` and the offending fields in `errors`. Meaning (text length, QR
 * validity) is checked in the domain, not here.
 */
export function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ProblemException('VALIDATION_ERROR', {
    errors: fieldErrors(result.error.issues),
  });
}
