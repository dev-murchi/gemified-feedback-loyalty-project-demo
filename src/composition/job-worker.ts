/** What the composition starts and stops, whichever queue driver runs the jobs. */
export interface JobWorker {
  /** Idempotent: a second call does nothing. */
  start(intervalMs: number): void;
  /** Lets a running job finish, then closes the queue and its connections. */
  stop(): Promise<void>;
  /** Closes the connections at once, without waiting for a running job (the stop timed out). */
  forceStop(): Promise<void>;
  /**
   * What the start-up log says about this worker. Fields only describe the setup (driver, queue
   * names, Redis host and port, concurrency, periodic tasks): never a payload, comment text, user
   * id or credential (T-I4).
   */
  describe(intervalMs: number): Readonly<Record<string, unknown>>;
}
