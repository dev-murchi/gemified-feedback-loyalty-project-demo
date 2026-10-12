import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { configureHttp } from '../../src/platform/http/configure-http.js';
import {
  AUTHENTICATOR,
  BearerAuthGuard,
  type Authenticator,
  type Principal,
} from '../../src/platform/http/bearer-auth.guard.js';
import { err, ok } from '../../src/shared-kernel/result.js';
import { HttpTestController } from './http-test.controller.js';
import { RecordingLogger } from './recording-logger.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

export const GOOD_TOKEN = 'good-token';
export const PRINCIPAL: Principal = {
  userId: '00000000-0000-4000-8000-000000000001',
  keyIdentifier: 'Yz7kQ2mF9xR4tW1vB6nH3jL8pD5sA0gE2cU7iO4yT1q',
  trustLevel: 'normal',
};

const authenticator: Authenticator = {
  authenticate: (authorization) =>
    Promise.resolve(
      authorization === `Bearer ${GOOD_TOKEN}`
        ? ok(PRINCIPAL)
        : err({ code: 'UNAUTHORIZED' }),
    ),
};

@Module({
  controllers: [HttpTestController],
  providers: [
    BearerAuthGuard,
    { provide: AUTHENTICATOR, useValue: authenticator },
  ],
})
class HttpTestModule {}

export interface HttpTestApp {
  readonly app: NestExpressApplication;
  readonly logger: RecordingLogger;
}

/** A small Nest app with the platform HTTP defaults, for tests of src/platform/http. */
export async function startHttpTestApp(): Promise<HttpTestApp> {
  const logger = new RecordingLogger();
  const moduleRef = await Test.createTestingModule({
    imports: [HttpTestModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureHttp(app, { ids: new SequentialIdGenerator(), logger });
  await app.init();
  return { app, logger };
}
