import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Logger } from '../../shared-kernel/logger.js';
import type { ErrorCode } from './error-codes.js';
import { problemFor, type Problem } from './problem-details.js';
import { ProblemException } from './problem-exception.js';
import { requestIdOf } from './request-id.js';

/** The HTTP status a framework or library error carries (Nest exceptions, body-parser errors). */
const statusOf = (error: unknown): number | undefined => {
  if (error instanceof HttpException) return error.getStatus();
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
};

const FRAMEWORK_CODES: Readonly<Record<number, ErrorCode>> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/** Other client errors (malformed JSON, wrong media type) are request-format problems. */
const codeForStatus = (status: number | undefined): ErrorCode | undefined => {
  if (status === undefined || status >= 500) return undefined;
  return FRAMEWORK_CODES[status] ?? 'VALIDATION_ERROR';
};

/**
 * Every error leaves the API as a Problem Details response (RFC 9457, docs/07 §6). A
 * ProblemException is an expected outcome; framework client errors are mapped by status; anything
 * else (infrastructure error, programming error, a second concurrency conflict) is INTERNAL_ERROR:
 * logged with the request id, and never described to the client.
 */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = this.#problemFor(exception, requestIdOf(response));
    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  #problemFor(exception: unknown, requestId: string): Problem {
    if (exception instanceof ProblemException)
      return problemFor(exception.code, requestId, exception.extras);
    const code = codeForStatus(statusOf(exception));
    if (code !== undefined) return problemFor(code, requestId);
    this.logger.warn('Request failed with an unexpected error', {
      requestId,
      error: exception instanceof Error ? exception.name : typeof exception,
    });
    return problemFor('INTERNAL_ERROR', requestId);
  }
}
