import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HTTP_APP_OPTIONS } from './platform/http/raw-body.js';
import { AppModule } from './composition/app.module.js';
import { configureApp } from './composition/configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    HTTP_APP_OPTIONS,
  );
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
