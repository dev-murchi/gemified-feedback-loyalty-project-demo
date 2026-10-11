import { Module } from '@nestjs/common';
import { PersistenceModule } from './persistence.module.js';
import { CatalogModule } from './catalog.module.js';
import { GamificationModule } from './gamification.module.js';
import { EventRoutesModule } from './event-routes.module.js';

// Composition root: each context's module is wired in here as it is built (docs/07 §2).
@Module({
  imports: [
    PersistenceModule,
    CatalogModule,
    GamificationModule,
    EventRoutesModule,
  ],
})
export class AppModule {}
