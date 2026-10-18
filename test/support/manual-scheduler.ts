import type { Schedule } from '../../src/platform/http/refusal-summary.js';

/** A Schedule that runs nothing by itself: the test decides when a window ends. */
export class ManualScheduler {
  readonly #pending = new Map<number, () => void>();
  #next = 0;

  readonly schedule: Schedule = (run) => {
    const id = this.#next++;
    this.#pending.set(id, run);
    return () => {
      this.#pending.delete(id);
    };
  };

  get pending(): number {
    return this.#pending.size;
  }

  /** Ends every window that is open. */
  fireAll(): void {
    for (const run of [...this.#pending.values()]) run();
  }
}
