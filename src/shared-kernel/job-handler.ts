/** What a job's handler decided: finished, or to be run again at a given time. */
export type JobResult =
  | { readonly outcome: 'done' }
  | { readonly outcome: 'retry'; readonly at: Date };

/**
 * Handles one job of a queue. A returned `retry` is a planned rerun (e.g. the LLM provider was
 * unreachable). A thrown error is an unplanned failure (an infrastructure or programming error):
 * the queue retries it with JOB_FAILURE_BACKOFF and, after the last attempt, gives up on it.
 */
export interface JobHandler {
  handle(payload: unknown): Promise<JobResult>;
}
