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
}

/**
 * What every HTTP entry point gets: a request id first (so even a rejected body has one), the 8 KB
 * JSON limit, and the Problem Details filter. The application must be created with
 * `bodyParser: false`; the parser is registered here, after the request id.
 */
export function configureHttp(
  app: NestExpressApplication,
  deps: HttpDefaultsDeps,
): void {
  app.use(requestIdMiddleware(deps.ids));
  app.useBodyParser('json', { limit: MAX_BODY });
  app.useGlobalFilters(new ProblemFilter(deps.logger));
}
