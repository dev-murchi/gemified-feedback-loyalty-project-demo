import type { DomainEvent } from '../domain-event.js';
import type { EventRoute, EventRouting } from '../event-routing.js';

/**
 * The application's event routes (docs/07 §4). It is created before the unit of work, filled once
 * by the composition root (src/composition/event-routes.ts) after every handler exists, then
 * frozen before the application serves requests. This breaks the construction cycle: the unit of
 * work needs routes, handlers need repositories, repositories need the unit of work.
 */
export class EventRouter implements EventRouting {
  readonly #routes = new Map<string, EventRoute>();
  #frozen = false;

  /**
   * Registers the route of one event type. The key is typed from the event (`UserRegistered['type']`)
   * and the handlers must accept that event, so a typo or a mismatched handler does not compile.
   */
  register<Event extends DomainEvent>(
    type: Event['type'],
    route: EventRoute<Event>,
  ): void {
    if (this.#frozen)
      throw new Error(`Event routes are frozen; cannot register "${type}"`);
    if (this.#routes.has(type))
      throw new Error(`A route for "${type}" is already registered`);
    this.#routes.set(type, route);
  }

  freeze(): void {
    this.#frozen = true;
  }

  get frozen(): boolean {
    return this.#frozen;
  }

  /**
   * Refuses to answer before freeze(): routes that were never completely registered are a wiring
   * error, never a silently unrouted event.
   */
  routeFor(type: string): EventRoute | undefined {
    if (!this.#frozen) {
      throw new Error(
        `Event routes are not frozen yet (looking up "${type}"); register them in src/composition/event-routes.ts`,
      );
    }
    return this.#routes.get(type);
  }
}
