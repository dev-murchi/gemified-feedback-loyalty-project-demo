import type { Logger } from '../../shared-kernel/logger.js';

export interface OutageLogDeps {
  readonly logger: Logger;
  /** The warning for the first failure of an outage. */
  readonly down: string;
  /** The line for the first success after it. */
  readonly up: string;
}

/**
 * Tells the log about an outage once, not once per request: one warning when the first call fails,
 * one info line when the next call works again. The fields hold only the error's name, never a
 * message, which could carry an address or a key (T-I4).
 */
export class OutageLog {
  #down = false;

  constructor(private readonly deps: OutageLogDeps) {}

  failed(error: unknown): void {
    if (this.#down) return;
    this.#down = true;
    this.deps.logger.warn(this.deps.down, {
      error: error instanceof Error ? error.name : typeof error,
    });
  }

  recovered(): void {
    if (!this.#down) return;
    this.#down = false;
    this.deps.logger.info(this.deps.up);
  }
}
