import { FeedbackId } from '../../../../../shared-kernel/ids.js';
import type {
  JobHandler,
  JobResult,
} from '../../../../../shared-kernel/job-handler.js';
import type {
  ProcessAnalysisJob,
  ProcessAnalysisJobCommand,
} from '../../../application/use-cases/process-analysis-job.js';

/** The queue FeedbackSubmitted is relayed to (ADR-020: the only asynchronous boundary). */
export const ANALYSIS_QUEUE = 'analysis';

const DONE: JobResult = { outcome: 'done' };

/** A Date in memory, an ISO text after a trip through Redis (BullMQ stores JSON). */
const dateOf = (value: unknown): Date | undefined => {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : undefined;
  return date === undefined || Number.isNaN(date.getTime()) ? undefined : date;
};

/**
 * The FeedbackSubmitted payload as a command. A payload that does not fit is a wiring error, so it
 * throws: the queue backs off and finally gives up, and the 24-hour sweeper closes the feedback.
 */
function commandOf(payload: unknown): ProcessAnalysisJobCommand {
  const event = (payload ?? {}) as Record<string, unknown>;
  const id = FeedbackId.create(
    typeof event['aggregateId'] === 'string' ? event['aggregateId'] : '',
  );
  const submittedAt = dateOf(event['submittedAt']);
  const sector = event['sector'];
  if (!id.ok || submittedAt === undefined || typeof sector !== 'string')
    throw new Error('Malformed analysis job payload');
  return { feedbackId: id.value, sector, submittedAt };
}

/**
 * Runs one analysis job from the queue (docs/06 §5.4). A planned retry (the provider was
 * unreachable or answered off-schema) becomes a rerun at the RetryPolicy's time; analyzed,
 * skipped and past the deadline are all done for the queue.
 */
export class AnalysisJobHandler implements JobHandler {
  constructor(private readonly process: ProcessAnalysisJob) {}

  async handle(payload: unknown): Promise<JobResult> {
    const outcome = await this.process.execute(commandOf(payload));
    return outcome.outcome === 'retry'
      ? { outcome: 'retry', at: outcome.at }
      : DONE;
  }
}
