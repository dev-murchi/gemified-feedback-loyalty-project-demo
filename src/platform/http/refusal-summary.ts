import type { Logger } from '../../shared-kernel/logger.js';

/** Injection token for the RefusalSummary the composition root provides. */
export const REFUSAL_SUMMARY = Symbol('RefusalSummary');

/** A refusal window lasts this long from a client's first refusal. */
export const REFUSAL_WINDOW_MS = 60_000;

/** Runs `run` once after `afterMs` and returns a function that cancels it. */
export type Schedule = (run: () => void, afterMs: number) => () => void;

/** The real timer; it does not keep the process alive. */
export const timerSchedule: Schedule = (run, afterMs) => {
  const timer = setTimeout(run, afterMs);
  timer.unref();
  return () => clearTimeout(timer);
};

export interface RefusalSummaryDeps {
  readonly logger: Logger;
  readonly schedule: Schedule;
}

/**
 * What the operators see of B2B calls the rate limit refused. A refused call is not an access, so
 * it stays out of the audit log (FR-B2B-09), and a flood must not fill that log. Instead, the first
 * refusal of a client opens a window of one minute; when it ends, ONE warning says which client,
 * which endpoint (the one refused most) and how many calls were refused in all. Only verified
 * clients are tracked, so the memory is bounded by the number of clients. Nothing personal is logged.
 */
export class RefusalSummary {
  readonly #windows = new Map<
    string,
    { readonly endpoints: Map<string, number>; readonly cancel: () => void }
  >();

  constructor(private readonly deps: RefusalSummaryDeps) {}

  refused(clientId: string, endpoint: string): void {
    const window = this.#windows.get(clientId) ?? this.#open(clientId);
    window.endpoints.set(endpoint, (window.endpoints.get(endpoint) ?? 0) + 1);
  }

  /** Reports every open window now (at shutdown), so no refusal goes unreported. */
  flush(): void {
    for (const clientId of [...this.#windows.keys()]) this.#close(clientId);
  }

  #open(clientId: string) {
    const window = {
      endpoints: new Map<string, number>(),
      cancel: this.deps.schedule(
        () => this.#close(clientId),
        REFUSAL_WINDOW_MS,
      ),
    };
    this.#windows.set(clientId, window);
    return window;
  }

  #close(clientId: string): void {
    const window = this.#windows.get(clientId);
    if (window === undefined) return;
    this.#windows.delete(clientId);
    window.cancel();
    const counts = [...window.endpoints.entries()];
    const [endpoint = ''] = counts.reduce((most, next) =>
      next[1] > most[1] ? next : most,
    );
    this.deps.logger.warn('B2B client was rate limited', {
      clientId,
      endpoint,
      refused: counts.reduce((total, [, count]) => total + count, 0),
    });
  }
}
