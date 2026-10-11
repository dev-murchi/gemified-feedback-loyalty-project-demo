import { EventRouter } from '../../../src/shared-kernel/adapters/event-router.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';
import type { EventHandler } from '../../../src/shared-kernel/event-routing.js';

type ThingHappened = DomainEvent<'ThingHappened'>;

const handler: EventHandler<ThingHappened> = {
  handle: () => Promise.resolve(),
};

describe('EventRouter', () => {
  it('returns the registered route of an event type, and nothing for others', () => {
    // Given a router with one route
    const router = new EventRouter();
    router.register<ThingHappened>('ThingHappened', { sync: [handler] });
    router.freeze();

    // When routes are looked up
    // Then only the registered type has one
    expect(router.routeFor('ThingHappened')).toEqual({ sync: [handler] });
    expect(router.routeFor('OtherHappened')).toBeUndefined();
  });

  it('refuses a second route for the same event type', () => {
    // Given a registered route
    const router = new EventRouter();
    router.register<ThingHappened>('ThingHappened', { sync: [handler] });

    // When the same type is registered again
    const again = () =>
      router.register<ThingHappened>('ThingHappened', { outbox: true });

    // Then it is a programming error
    expect(again).toThrow();
  });

  it('refuses registrations after it is frozen', () => {
    // Given a frozen router
    const router = new EventRouter();
    router.freeze();

    // When a route is registered
    const late = () =>
      router.register<ThingHappened>('ThingHappened', { sync: [handler] });

    // Then it is a programming error and the router is still frozen and empty
    expect(late).toThrow();
    expect(router.frozen).toBe(true);
    expect(router.routeFor('ThingHappened')).toBeUndefined();
  });
});

describe('EventRouter before freeze', () => {
  it('refuses to answer until it is frozen, so incomplete wiring cannot route events', () => {
    // Given a router whose routes are registered but not frozen
    const router = new EventRouter();
    router.register<ThingHappened>('ThingHappened', { sync: [handler] });

    // When a route is looked up
    const early = () => router.routeFor('ThingHappened');

    // Then it is a wiring error
    expect(early).toThrow();
  });
});

describe('EventRouter route keys (compile time)', () => {
  it('only accepts the event type of the handlers as key', () => {
    // Given a router and a handler for ThingHappened
    const router = new EventRouter();

    // When the key does not match the handler's event type, Then it does not compile
    // (typecheck fails if the marked line ever stops being an error)
    const route = { sync: [handler] };
    const typo = () =>
      // @ts-expect-error 'ThingHapened' is not ThingHappened['type']
      router.register<ThingHappened>('ThingHapened', route);

    expect(typo).toBeTypeOf('function');
  });
});
