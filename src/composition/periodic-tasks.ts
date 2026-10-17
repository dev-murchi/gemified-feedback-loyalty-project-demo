import type { Clock } from '../shared-kernel/clock.js';

/** A job the worker runs on a schedule (e.g. the 24-hour sweeper), at most once per `everyMs`. */
export interface PeriodicTask {
  readonly name: string;
  readonly everyMs: number;
  run(): Promise<void>;
}

/** Runs the tasks whose time has come; shared by the in-memory and the BullMQ worker. */
export class PeriodicTasks {
  readonly #lastRun = new Map<string, number>();

  constructor(
    private readonly tasks: readonly PeriodicTask[],
    private readonly clock: Clock,
  ) {}

  /** Each task runs on the first call, then once `everyMs` has passed by the application clock. */
  async runDue(): Promise<void> {
    const now = this.clock.now().getTime();
    for (const task of this.tasks) {
      const last = this.#lastRun.get(task.name);
      if (last !== undefined && now - last < task.everyMs) continue;
      this.#lastRun.set(task.name, now);
      await task.run();
    }
  }
}
