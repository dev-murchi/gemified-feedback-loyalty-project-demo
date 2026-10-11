import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/composition/app.module.js';

describe('API application (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app.close();
  });

  it('boots with the composition root module', async () => {
    // Given the composition root module
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // When the application is initialised
    app = moduleRef.createNestApplication();
    await app.init();

    // Then it exposes an HTTP server
    expect(app.getHttpServer()).toBeDefined();
  });
});
