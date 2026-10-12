import type { DomainError } from '../../shared-kernel/domain-error.js';
import { isErrorCode, type ErrorCode } from './error-codes.js';
import type { FieldError, ProblemExtras } from './problem-details.js';

/**
 * Thrown by inbound adapters to end a request with a Problem Details response. A use case's
 * business outcome (`Err`) becomes one through `ProblemException.from`; the filter does the rest.
 */
export class ProblemException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly extras: ProblemExtras = {},
  ) {
    super(code);
  }

  /**
   * A domain error as an HTTP problem. A VALIDATION_ERROR with a `field` names that field; a code
   * the API does not know is a programming error and throws a plain Error.
   */
  static from(error: DomainError): ProblemException {
    if (!isErrorCode(error.code))
      throw new Error(
        `Domain error code ${error.code} is not in the API catalog`,
      );
    return new ProblemException(error.code, extrasOf(error));
  }
}

const fieldOf = (error: DomainError): string | undefined => {
  const field = (error as { field?: unknown }).field;
  return typeof field === 'string' ? field : undefined;
};

const retryAfterOf = (error: DomainError): number | undefined => {
  const seconds = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof seconds === 'number' ? seconds : undefined;
};

function extrasOf(error: DomainError): ProblemExtras {
  const field = fieldOf(error);
  const retryAfterSeconds = retryAfterOf(error);
  const errors: FieldError[] | undefined =
    error.code === 'VALIDATION_ERROR' && field !== undefined
      ? [{ field, message: 'invalid value' }]
      : undefined;
  return {
    ...(errors === undefined ? {} : { errors }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}
