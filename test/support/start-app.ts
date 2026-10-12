import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../../src/composition/app.module.js';
import { configureApp } from '../../src/composition/configure-app.js';
import { CLOCK, LOGGER } from '../../src/composition/tokens.js';
import { FakeClock } from './fake-clock.js';
import { contractRecorder } from './exchange-recorder.js';
import { RecordingLogger } from './recording-logger.js';

/** Replaces providers before the app is built; it is given the clock and logger the app uses. */
export type Customise = (
  builder: TestingModuleBuilder,
  context: { readonly clock: FakeClock; readonly logger: RecordingLogger },
) => TestingModuleBuilder;

export interface RunningApp {
  readonly app: NestExpressApplication;
  readonly clock: FakeClock;
  readonly logger: RecordingLogger;
}

/** The real AppModule with a controllable clock and a recording logger; nothing else is replaced. */
export function appBuilder(
  clock: FakeClock,
  logger: RecordingLogger,
): TestingModuleBuilder {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(LOGGER)
    .useValue(logger);
}

/** Starts the whole API the way main.api.ts does, without listening on a port. */
export async function startApp(
  customise: Customise = (builder) => builder,
): Promise<RunningApp> {
  const clock = new FakeClock(new Date('2026-10-13T09:00:00.000Z'));
  const logger = new RecordingLogger();
  const moduleRef = await customise(appBuilder(clock, logger), {
    clock,
    logger,
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  // Registered first, so it sees every response, including those of the platform filter.
  app.use(contractRecorder(inject('contractPath')));
  configureApp(app);
  await app.init();
  return { app, clock, logger };
}
