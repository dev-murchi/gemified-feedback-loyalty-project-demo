// The only place where event routes are registered (docs/07 §4, ADR-020). Contexts export their
// handlers; this file connects them to the events they react to, then freezes the router.

import type { FeedbackValidated } from '../contexts/feedback/public/feedback-validated.js';
import type { UserRegistered } from '../contexts/identity/public/user-registered.js';
import type { EventRouter } from '../shared-kernel/adapters/event-router.js';
import type { EventHandler } from '../shared-kernel/event-routing.js';

export interface EventHandlers {
  readonly openWallet: EventHandler<UserRegistered>;
  readonly awardReward: EventHandler<FeedbackValidated>;
}

export function registerEventRoutes(
  router: EventRouter,
  handlers: EventHandlers,
): void {
  router.register<UserRegistered>('UserRegistered', {
    sync: [handlers.openWallet],
  });
  router.register<FeedbackValidated>('FeedbackValidated', {
    sync: [handlers.awardReward],
  });
  router.freeze();
}
