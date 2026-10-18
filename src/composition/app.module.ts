import { Module } from '@nestjs/common';
import { AnalysisModule } from './analysis.module.js';
import { PersistenceModule } from './persistence.module.js';
import { RateLimitModule } from './rate-limit.module.js';
import { CatalogModule } from './catalog.module.js';
import { GamificationModule } from './gamification.module.js';
import { EventRoutesModule } from './event-routes.module.js';
import { FeedbackModule } from './feedback.module.js';
import { IdentityModule } from './identity.module.js';
import { InsightsModule } from './insights.module.js';
import { WalletHttpModule } from './wallet-http.module.js';
import { WorkerModule } from './worker.module.js';

// Composition root: each context's module is wired in here as it is built (docs/07 §2).
@Module({
  imports: [
    PersistenceModule,
    RateLimitModule,
    CatalogModule,
    GamificationModule,
    IdentityModule,
    WalletHttpModule,
    FeedbackModule,
    AnalysisModule,
    InsightsModule,
    WorkerModule,
    EventRoutesModule,
  ],
})
export class AppModule {}
