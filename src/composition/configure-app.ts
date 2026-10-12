import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from '../platform/http/configure-http.js';
import { RandomIdGenerator } from '../shared-kernel/adapters/random-id-generator.js';
import type { Logger } from '../shared-kernel/logger.js';
import { LOGGER } from './tokens.js';

/**
 * The HTTP set-up every entry point of the API shares: main.api.ts and the e2e tests. The
 * application must be created with `bodyParser: false` (configureHttp registers the 8 KB parser).
 */
export function configureApp(app: NestExpressApplication): void {
  configureHttp(app, {
    ids: new RandomIdGenerator(),
    logger: app.get<Logger>(LOGGER),
  });
}
