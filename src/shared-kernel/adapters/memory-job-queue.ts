import { reasonOf } from '../failure-reason.js';
import type { JobHandler } from '../job-handler.js';
import { attemptsExhausted, failureDelayMs } from '../job-failure-backoff.js';
import type { JobQueue, QueuedJob } from '../job-queue.js';

export type JobStatus = 'waiting' | 'done' | 'failed';

/** A job and where it stands; `runAt` moves on a planned retry or after a failure. */
export interface JobState {
  readonly job: QueuedJob;
  readonly status: JobStatus;
  readonly runAt: Date;
  /** Thrown failures so far; planned retries do not count. */
  readonly failures: number;
  /** The last failure's error name and message, never the payload. */
  readonly lastError: string | null;
}

/** What one `runDue` pass did, for the caller to log. */
export interface RunReport {
  readonly done: number;
  readonly retried: number;
  readonly failedForGood: readonly JobState[];
}

/**
 * The in-memory job queue (QUEUE_DRIVER=memory): for tests and the single-process demo. A job id
 * is accepted once, like BullMQ's jobId. `runDue` runs the jobs whose time has come, one after the
 * other: a planned retry moves the job, a thrown error backs off (JOB_FAILURE_BACKOFF), and a job
 * out of attempts is marked failed and never run again.
 */
export class MemoryJobQueue implements JobQueue {
  readonly #queues = new Map<string, Map<string, JobState>>();

  enqueue(job: QueuedJob): Promise<void> {
    const jobs = this.#queues.get(job.queue) ?? new Map<string, JobState>();
    if (!jobs.has(job.id))
      jobs.set(job.id, {
        job: { ...job },
        status: 'waiting',
        runAt: job.runAt ?? new Date(0),
        failures: 0,
        lastError: null,
      });
    this.#queues.set(job.queue, jobs);
    return Promise.resolve();
  }

  /** The jobs of a queue as they were accepted, in that order. */
  jobsOf(queue: string): readonly QueuedJob[] {
    return this.statesOf(queue).map((state) => state.job);
  }

  statesOf(queue: string): readonly JobState[] {
    return [...(this.#queues.get(queue)?.values() ?? [])];
  }

  async runDue(
    queue: string,
    handler: JobHandler,
    now: Date,
  ): Promise<RunReport> {
    const due = this.statesOf(queue).filter(
      (state) => state.status === 'waiting' && state.runAt <= now,
    );
    const report = { done: 0, retried: 0, failedForGood: [] as JobState[] };
    for (const state of due) {
      const next = await this.#run(state, handler, now);
      this.#queues.get(queue)?.set(state.job.id, next);
      if (next.status === 'done') report.done += 1;
      else if (next.status === 'failed') report.failedForGood.push(next);
      else report.retried += 1;
    }
    return report;
  }

  async #run(
    state: JobState,
    handler: JobHandler,
    now: Date,
  ): Promise<JobState> {
    try {
      const result = await handler.handle(state.job.payload);
      return result.outcome === 'done'
        ? { ...state, status: 'done' }
        : { ...state, runAt: new Date(result.at) };
    } catch (error) {
      const failures = state.failures + 1;
      return {
        ...state,
        failures,
        lastError: reasonOf(error),
        status: attemptsExhausted(failures) ? 'failed' : 'waiting',
        runAt: new Date(now.getTime() + failureDelayMs(failures)),
      };
    }
  }
}
