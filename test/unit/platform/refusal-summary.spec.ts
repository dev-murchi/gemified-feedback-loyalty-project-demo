import {
  REFUSAL_WINDOW_MS,
  RefusalSummary,
  timerSchedule,
} from '../../../src/platform/http/refusal-summary.js';
import { ManualScheduler } from '../../support/manual-scheduler.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const TOPICS = 'GET /v1/b2b/topics';
const BRANCHES = 'GET /v1/b2b/branches';

const setup = () => {
  const logger = new RecordingLogger();
  const scheduler = new ManualScheduler();
  const summary = new RefusalSummary({ logger, schedule: scheduler.schedule });
  return { logger, scheduler, summary };
};

describe('RefusalSummary (rate-limited B2B calls stay out of the audit log)', () => {
  it('says nothing while the window is open, then one warning with the client, the endpoint and the count', () => {
    // Given five refusals of one client in one window
    const { logger, scheduler, summary } = setup();
    for (let i = 0; i < 5; i += 1) summary.refused('fuel-panel', TOPICS);
    expect(logger.warnings).toEqual([]);

    // When the window ends
    scheduler.fireAll();

    // Then exactly one summary is logged
    expect(logger.warnings).toEqual([
      {
        message: 'B2B client was rate limited',
        fields: { clientId: 'fuel-panel', endpoint: TOPICS, refused: 5 },
      },
    ]);
  });

  it('opens one window per client, not one per refusal', () => {
    const { scheduler, summary } = setup();

    for (let i = 0; i < 100; i += 1) summary.refused('fuel-panel', TOPICS);

    expect(scheduler.pending).toBe(1);
  });

  it('names the endpoint refused most and counts the refusals of all endpoints', () => {
    const { logger, scheduler, summary } = setup();
    summary.refused('fuel-panel', BRANCHES);
    summary.refused('fuel-panel', TOPICS);
    summary.refused('fuel-panel', TOPICS);

    scheduler.fireAll();

    expect(logger.warnings[0]?.fields).toEqual({
      clientId: 'fuel-panel',
      endpoint: TOPICS,
      refused: 3,
    });
  });

  it('keeps clients apart: one warning for each', () => {
    const { logger, scheduler, summary } = setup();
    summary.refused('fuel-panel', TOPICS);
    summary.refused('coffee-panel', BRANCHES);
    summary.refused('coffee-panel', BRANCHES);

    scheduler.fireAll();

    expect(logger.warnings.map((warning) => warning.fields)).toEqual([
      { clientId: 'fuel-panel', endpoint: TOPICS, refused: 1 },
      { clientId: 'coffee-panel', endpoint: BRANCHES, refused: 2 },
    ]);
  });

  it('starts a new window, and a new warning, for refusals after the first window ended', () => {
    const { logger, scheduler, summary } = setup();
    summary.refused('fuel-panel', TOPICS);
    scheduler.fireAll();

    summary.refused('fuel-panel', TOPICS);
    summary.refused('fuel-panel', TOPICS);
    scheduler.fireAll();

    expect(logger.warnings.map((warning) => warning.fields.refused)).toEqual([
      1, 2,
    ]);
  });

  it('reports open windows at shutdown and cancels their timers', () => {
    const { logger, scheduler, summary } = setup();
    summary.refused('fuel-panel', TOPICS);

    summary.flush();

    expect(logger.warnings).toHaveLength(1);
    expect(scheduler.pending).toBe(0);
  });

  it('logs no key, address or text: only the client id, the route and the count', () => {
    const { logger, scheduler, summary } = setup();
    summary.refused('fuel-panel', TOPICS);
    scheduler.fireAll();

    expect(Object.keys(logger.warnings[0]?.fields ?? {}).sort()).toEqual([
      'clientId',
      'endpoint',
      'refused',
    ]);
  });
});

describe('timerSchedule', () => {
  it('runs after the delay and can be cancelled', () => {
    vi.useFakeTimers();
    try {
      const ran: string[] = [];
      timerSchedule(() => ran.push('kept'), REFUSAL_WINDOW_MS);
      const cancel = timerSchedule(
        () => ran.push('cancelled'),
        REFUSAL_WINDOW_MS,
      );
      cancel();

      vi.advanceTimersByTime(REFUSAL_WINDOW_MS);

      expect(ran).toEqual(['kept']);
    } finally {
      vi.useRealTimers();
    }
  });
});
