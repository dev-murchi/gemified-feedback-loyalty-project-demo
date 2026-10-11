import { Global, Module } from '@nestjs/common';
import { ConsoleLogger } from '../shared-kernel/adapters/console-logger.js';
import { EventRouter } from '../shared-kernel/adapters/event-router.js';
import { createInMemoryStore } from './in-memory-store.js';
import {
  EVENT_ROUTER,
  EVENT_ROUTES_CHECK,
  IN_MEMORY_STORE,
  LOGGER,
} from './tokens.js';

/**
 * Provides what every context module shares: the event router (created first, filled and frozen by
 * event-routes.ts), the in-memory store with its unit of work, and the logger.
 */
@Global()
@Module({
  providers: [
    { provide: EVENT_ROUTER, useFactory: () => new EventRouter() },
    {
      provide: IN_MEMORY_STORE,
      inject: [EVENT_ROUTER],
      useFactory: (router: EventRouter) => createInMemoryStore(router),
    },
    { provide: LOGGER, useFactory: () => new ConsoleLogger() },
    {
      // Start-up fails if event-routes.ts never registered and froze the routes (e.g. a missing
      // EventRoutesModule), instead of failing at the first event.
      provide: EVENT_ROUTES_CHECK,
      inject: [EVENT_ROUTER],
      useFactory: (router: EventRouter) => ({
        onApplicationBootstrap(): void {
          if (!router.frozen) {
            throw new Error(
              'Event routes were never registered and frozen (EventRoutesModule missing?)',
            );
          }
        },
      }),
    },
  ],
  exports: [EVENT_ROUTER, IN_MEMORY_STORE, LOGGER],
})
export class PersistenceModule {}
