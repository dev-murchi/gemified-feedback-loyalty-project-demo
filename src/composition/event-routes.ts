// The only place where event routes are registered (docs/07 §4, ADR-020). Contexts export their
// handlers; this file connects them to the events they react to, then freezes the router.

import type { FeedbackAnalyzed } from '../contexts/analysis/public/feedback-analyzed.js';
import type { FeedbackSubmitted } from '../contexts/feedback/public/feedback-submitted.js';
import type { FeedbackValidated } from '../contexts/feedback/public/feedback-validated.js';
import type { UserRegistered } from '../contexts/identity/public/user-registered.js';
import type { EventRouter } from '../shared-kernel/adapters/event-router.js';
import type { EventHandler } from '../shared-kernel/event-routing.js';

export interface EventHandlers {
  readonly openWallet: EventHandler<UserRegistered>;
  readonly awardReward: EventHandler<FeedbackValidated>;
  readonly applyAnalysisResult: EventHandler<FeedbackAnalyzed>;
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
  // The only asynchronous boundary (ADR-020): written to the outbox, relayed to the queue in S0-10.
  router.register<FeedbackSubmitted>('FeedbackSubmitted', { outbox: true });
  router.register<FeedbackAnalyzed>('FeedbackAnalyzed', {
    sync: [handlers.applyAnalysisResult],
  });
  router.freeze();
}
