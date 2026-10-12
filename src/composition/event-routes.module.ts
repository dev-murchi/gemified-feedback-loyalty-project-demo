import { Module } from '@nestjs/common';
import type { FeedbackValidated } from '../contexts/feedback/public/feedback-validated.js';
import type { UserRegistered } from '../contexts/identity/public/user-registered.js';
import type { EventRouter } from '../shared-kernel/adapters/event-router.js';
import type { EventHandler } from '../shared-kernel/event-routing.js';
import { registerEventRoutes } from './event-routes.js';
import { GamificationModule } from './gamification.module.js';
import {
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
  imports: [GamificationModule],
  providers: [
    {
      provide: EVENT_ROUTES,
      inject: [EVENT_ROUTER, OPEN_WALLET, AWARD_REWARD],
      useFactory: (
        router: EventRouter,
        openWallet: EventHandler<UserRegistered>,
        awardReward: EventHandler<FeedbackValidated>,
      ) => {
        registerEventRoutes(router, { openWallet, awardReward });
        return { frozen: router.frozen };
      },
    },
  ],
})
export class EventRoutesModule {}
