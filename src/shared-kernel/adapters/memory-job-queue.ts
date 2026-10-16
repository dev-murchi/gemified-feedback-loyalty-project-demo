import type { JobQueue, QueuedJob } from '../job-queue.js';

/**
 * The in-memory job queue (QUEUE_DRIVER=memory): for tests and the single-process demo. It keeps
 * every job it ever accepted by queue and id, so a job id is accepted once, like BullMQ's jobId.
 */
export class MemoryJobQueue implements JobQueue {
  readonly #queues = new Map<string, Map<string, QueuedJob>>();

  enqueue(job: QueuedJob): Promise<void> {
    const jobs = this.#queues.get(job.queue) ?? new Map<string, QueuedJob>();
    if (!jobs.has(job.id)) jobs.set(job.id, { ...job });
    this.#queues.set(job.queue, jobs);
    return Promise.resolve();
  }

  /** The jobs of a queue in the order they were first accepted. */
  jobsOf(queue: string): readonly QueuedJob[] {
    return [...(this.#queues.get(queue)?.values() ?? [])];
  }
}
