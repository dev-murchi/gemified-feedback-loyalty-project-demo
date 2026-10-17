import { AnalysisJobHandler } from '../../../src/contexts/analysis/adapters/inbound/queue/analysis-job.handler.js';
import type {
  JobOutcome,
  ProcessAnalysisJob,
  ProcessAnalysisJobCommand,
} from '../../../src/contexts/analysis/application/use-cases/process-analysis-job.js';

const ID = 'f0000000-0000-4000-8000-0000000000a1';
const SUBMITTED = new Date('2026-10-17T09:00:00.000Z');
const payload = {
  type: 'FeedbackSubmitted',
  aggregateId: ID,
  sector: 'fuel',
  submittedAt: SUBMITTED,
};

/** A ProcessAnalysisJob stand-in that records its commands and answers with `outcome`. */
const processing = (outcome: JobOutcome) => {
  const commands: ProcessAnalysisJobCommand[] = [];
  const process = {
    execute: (cmd: ProcessAnalysisJobCommand) => {
      commands.push(cmd);
      return Promise.resolve(outcome);
    },
  } as unknown as ProcessAnalysisJob;
  return { process, commands };
};

describe('AnalysisJobHandler', () => {
  it('runs the analysis for the submitted feedback', async () => {
    const { process, commands } = processing({ outcome: 'analyzed' });

    expect(await new AnalysisJobHandler(process).handle(payload)).toEqual({
      outcome: 'done',
    });
    expect(commands).toEqual([
      { feedbackId: ID, sector: 'fuel', submittedAt: SUBMITTED },
    ]);
  });

  it('reads the submission time from text too, as a payload comes back from Redis', async () => {
    const { process, commands } = processing({ outcome: 'skipped' });

    await new AnalysisJobHandler(process).handle({
      ...payload,
      submittedAt: SUBMITTED.toISOString(),
    });

    expect(commands[0]?.submittedAt).toEqual(SUBMITTED);
  });

  it('turns a planned retry into a rerun at that time', async () => {
    const at = new Date('2026-10-17T09:01:00.000Z');
    const { process } = processing({ outcome: 'retry', at });

    expect(await new AnalysisJobHandler(process).handle(payload)).toEqual({
      outcome: 'retry',
      at,
    });
  });

  it.each<JobOutcome>([{ outcome: 'skipped' }, { outcome: 'deadline_passed' }])(
    'is done for the queue when the job is %j',
    async (outcome) => {
      const { process } = processing(outcome);

      expect(await new AnalysisJobHandler(process).handle(payload)).toEqual({
        outcome: 'done',
      });
    },
  );

  it.each([
    ['no payload', undefined],
    ['a malformed id', { ...payload, aggregateId: 'nope' }],
    ['no sector', { ...payload, sector: undefined }],
    ['an unreadable time', { ...payload, submittedAt: 'soon' }],
  ])(
    'throws for %s, a wiring error the queue backs off from',
    async (_case, bad) => {
      const { process, commands } = processing({ outcome: 'analyzed' });

      await expect(new AnalysisJobHandler(process).handle(bad)).rejects.toThrow(
        'Malformed analysis job payload',
      );
      expect(commands).toEqual([]);
    },
  );
});
