import type { NextFunction, Request, Response } from 'express';
import type { IdGenerator } from '../../shared-kernel/id-generator.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** A caller-supplied id is kept only if it is short and plain; anything else is replaced. */
const ACCEPTABLE = /^[A-Za-z0-9._-]{1,64}$/;

/** Where the id lives for the rest of the request (a response-local, no global typing). */
export const requestIdOf = (response: Response): string => {
  const id: unknown = response.locals['requestId'];
  return typeof id === 'string' ? id : 'unknown';
};

/**
 * Gives every request a correlation id (docs/api/openapi.yaml, `X-Request-Id`): the caller's if it
 * is acceptable, else a new one. It is echoed in the response header and in every Problem.
 */
export function requestIdMiddleware(ids: IdGenerator) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const supplied = request.header(REQUEST_ID_HEADER);
    const id =
      supplied !== undefined && ACCEPTABLE.test(supplied)
        ? supplied
        : ids.next();
    response.locals['requestId'] = id;
    response.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}
