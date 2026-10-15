import { Module } from '@nestjs/common';
import type { FeedbackAnalyzed } from '../contexts/analysis/public/feedback-analyzed.js';
import type { FeedbackValidated } from '../contexts/feedback/public/feedback-validated.js';
import type { UserRegistered } from '../contexts/identity/public/user-registered.js';
import type { EventRouter } from '../shared-kernel/adapters/event-router.js';
import type { EventHandler } from '../shared-kernel/event-routing.js';
import { registerEventRoutes } from './event-routes.js';
import { FeedbackModule } from './feedback.module.js';
import { GamificationModule } from './gamification.module.js';
import {
  APPLY_ANALYSIS_RESULT,
  AWARD_REWARD,
  EVENT_ROUTER,
  EVENT_ROUTES,
  OPEN_WALLET,
} from './tokens.js';

/**
 * Runs event-routes.ts once every handler exists, during application start-up, so the router is
 * frozen before the application serves requests.
 */
@Module({
  imports: [GamificationModule, FeedbackModule],
  providers: [
    {
      provide: EVENT_ROUTES,
      inject: [EVENT_ROUTER, OPEN_WALLET, AWARD_REWARD, APPLY_ANALYSIS_RESULT],
      useFactory: (
        ...[router, openWallet, awardReward, applyAnalysisResult]: [
          EventRouter,
          EventHandler<UserRegistered>,
          EventHandler<FeedbackValidated>,
          EventHandler<FeedbackAnalyzed>,
        ]
      ) => {
        registerEventRoutes(router, {
          openWallet,
          awardReward,
          applyAnalysisResult,
        });
        return { frozen: router.frozen };
      },
    },
  ],
})
export class EventRoutesModule {}
