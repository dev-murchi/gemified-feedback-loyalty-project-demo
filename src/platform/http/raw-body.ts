import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The application options every entry point must use: no default parser (configureHttp registers
 * the 8 KB one) and the raw body kept, because the platform proof and the request fingerprint are
 * taken over the bytes exactly as received (FR-QR-10, docs/api/openapi.yaml `X-Platform-Proof`).
 */
export const HTTP_APP_OPTIONS = { bodyParser: false, rawBody: true } as const;

/**
 * The body bytes as received. A parsed body without raw bytes means the application was created
 * without HTTP_APP_OPTIONS: a wiring error, so this throws (500) instead of hashing nothing.
 */
export function rawBodyOf(request: RawBodyRequest<Request>): Buffer {
  if (request.rawBody !== undefined) return request.rawBody;
  if (request.body === undefined) return Buffer.alloc(0);
  throw new Error(
    'Raw request body is not kept; create the app with HTTP_APP_OPTIONS',
  );
}
