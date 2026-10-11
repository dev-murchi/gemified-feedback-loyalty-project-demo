import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CatalogModule } from '../../src/composition/catalog.module.js';
import { GamificationModule } from '../../src/composition/gamification.module.js';
import { PersistenceModule } from '../../src/composition/persistence.module.js';

/** The application without EventRoutesModule: the routes are never registered or frozen. */
@Module({ imports: [PersistenceModule, CatalogModule, GamificationModule] })
class AppWithoutEventRoutes {}

describe('event routes at start-up (e2e)', () => {
  it('refuses to start when the event routes were never registered and frozen', async () => {
    // Given the application wired without EventRoutesModule
    const moduleRef = await Test.createTestingModule({
      imports: [AppWithoutEventRoutes],
    }).compile();
    const app = moduleRef.createNestApplication();

    // When it starts
    const start = app.init();

    // Then start-up fails instead of the first event
    await expect(start).rejects.toThrow(
      'Event routes were never registered and frozen',
    );
  });
});
