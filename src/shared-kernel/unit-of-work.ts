import type { DomainEvent } from './domain-event.js';

/**
 * One database transaction (docs/06 §7, ADR-020). When `work` finishes, the events collected
 * during it are delivered: synchronous handlers run inside the same transaction and
 * outbox-routed events are written to the outbox. If anything throws, every change is undone.
 * External calls (LLM, Apple/Google) must not happen inside `work` (docs/07 §5).
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/** Used by repositories: `save` hands the aggregate's recorded events to the current unit of work. */
export interface EventCollector {
  collect(events: readonly DomainEvent[]): void;
}
