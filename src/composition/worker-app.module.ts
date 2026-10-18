import { Module } from '@nestjs/common';
import { AnalysisModule } from './analysis.module.js';
import { CatalogModule } from './catalog.module.js';
import { EventRoutesModule } from './event-routes.module.js';
import { FeedbackModule } from './feedback.module.js';
import { GamificationModule } from './gamification.module.js';
import { PersistenceModule } from './persistence.module.js';
import { SweeperModule } from './sweeper.module.js';
import { WorkerModule } from './worker.module.js';

/**
 * The root of the worker process (`main.worker.ts`): only what the worker's work uses, so it needs
 * none of the API's secrets or connections (least privilege, NFR-SEC-06). It relays the outbox,
 * consumes the analysis queue, applies the result with the reward, and runs the sweeper. Identity,
 * Insights, every HTTP module, the rate limiter and the challenge store are not loaded, so the JWT
 * and B2B signing keys, RATE_LIMIT_DRIVER and CHALLENGE_STORE_DRIVER are not needed. What it does
 * need: RAW_TEXT_KEY (decrypting raw text), the LLM settings, QUEUE_DRIVER and REDIS_URL.
 */
@Module({
  imports: [
    PersistenceModule,
    CatalogModule,
    GamificationModule,
    FeedbackModule,
    AnalysisModule,
    EventRoutesModule,
    SweeperModule,
    WorkerModule,
  ],
})
export class WorkerAppModule {}
