import { ERROR_STATUS, ERROR_TITLE, type ErrorCode } from './error-codes.js';

/** One invalid request field (`VALIDATION_ERROR` only). */
export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/** The `Problem` schema of docs/api/openapi.yaml: RFC 9457 plus the application's `code`. */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly code: ErrorCode;
  readonly requestId: string;
  readonly retryAfterSeconds?: number;
  readonly errors?: readonly FieldError[];
}

/** What a specific occurrence adds to the fixed parts of its code. */
export interface ProblemExtras {
  readonly detail?: string;
  readonly retryAfterSeconds?: number;
  readonly errors?: readonly FieldError[];
}

/** `https://errors.example.invalid/challenge-invalid` for CHALLENGE_INVALID. */
const typeUri = (code: ErrorCode): string =>
  `https://errors.example.invalid/${code.toLowerCase().replaceAll('_', '-')}`;

export function problemFor(
  code: ErrorCode,
  requestId: string,
  extras: ProblemExtras = {},
): Problem {
  return {
    type: typeUri(code),
    title: ERROR_TITLE[code],
    status: ERROR_STATUS[code],
    code,
    requestId,
    ...extras,
  };
}
