import type { Clock } from '../../src/shared-kernel/clock.js';

/** Controllable time for tests; never use the real clock or sleep in tests (docs/07 §9). */
export class FakeClock implements Clock {
  #now: Date;

  constructor(start: Date = new Date('2026-10-12T09:00:00.000Z')) {
    this.#now = new Date(start);
  }

  now(): Date {
    return new Date(this.#now);
  }

  set(at: Date): void {
    this.#now = new Date(at);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}
