import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IdGenerator } from '../../shared-kernel/id-generator.js';
import type { Logger } from '../../shared-kernel/logger.js';
import { ProblemFilter } from './problem.filter.js';
import { requestIdMiddleware } from './request-id.js';

/** docs/api/openapi.yaml: `413 PAYLOAD_TOO_LARGE` above 8 KB. */
export const MAX_BODY = '8kb';

export interface HttpDefaultsDeps {
  readonly ids: IdGenerator;
  readonly logger: Logger;
  /**
   * How many reverse proxies stand in front of the API and set X-Forwarded-For (TRUST_PROXY_HOPS).
   * 0 or absent: the header is ignored and the socket address counts.
   */
  readonly trustProxyHops?: number;
}

/**
 * What every HTTP entry point gets: a request id first (so even a rejected body has one), the 8 KB
 * JSON limit, and the Problem Details filter. The application must be created with
 * HTTP_APP_OPTIONS (raw-body.ts); the parser is registered here, after the request id.
 */
export function configureHttp(
  app: NestExpressApplication,
  deps: HttpDefaultsDeps,
): void {
  // Express announces itself in `X-Powered-By` by default; the API reveals nothing about its stack (T-I7).
  app.disable('x-powered-by');
  if (deps.trustProxyHops !== undefined && deps.trustProxyHops > 0)
    app.set('trust proxy', deps.trustProxyHops);
  app.use(requestIdMiddleware(deps.ids));
  app.useBodyParser('json', { limit: MAX_BODY });
  // The OAuth2 token endpoint takes application/x-www-form-urlencoded (RFC 6749 §4.4).
  app.useBodyParser('urlencoded', { limit: MAX_BODY, extended: false });
  app.useGlobalFilters(new ProblemFilter(deps.logger));
}
