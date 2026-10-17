import type { INestApplicationContext } from '@nestjs/common';
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  runWorker,
  shutdownTimeoutFrom,
  WorkerStopTimeoutError,
  type SignalSource,
} from '../../../src/composition/start-worker.js';
import { JOB_WORKER, LOGGER } from '../../../src/composition/tokens.js';
import type { JobWorker } from '../../../src/composition/job-worker.js';
import { RecordingLogger } from '../../support/recording-logger.js';

describe('shutdownTimeoutFrom (WORKER_SHUTDOWN_TIMEOUT_MS)', () => {
  it.each([undefined, ''])('is 25 000 ms when the variable is %s', (value) => {
    expect(shutdownTimeoutFrom({ WORKER_SHUTDOWN_TIMEOUT_MS: value })).toBe(
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
    );
    expect(DEFAULT_SHUTDOWN_TIMEOUT_MS).toBe(25_000);
  });

  it('reads a positive whole number of milliseconds', () => {
    expect(shutdownTimeoutFrom({ WORKER_SHUTDOWN_TIMEOUT_MS: '8000' })).toBe(
      8000,
    );
  });

  it.each(['0', '-5', '2.5', 'soon'])(
    'refuses %s at start-up instead of guessing',
    (value) => {
      expect(() =>
        shutdownTimeoutFrom({ WORKER_SHUTDOWN_TIMEOUT_MS: value }),
      ).toThrow('Invalid WORKER_SHUTDOWN_TIMEOUT_MS');
    },
  );
});

describe('runWorker shutdown', () => {
  type Listener = () => void;
  const listeners = new Map<string, Listener>();
  const signals: SignalSource = {
    on: (signal, listener) => listeners.set(signal, listener),
    off: (signal) => listeners.delete(signal),
  };
  let logger: RecordingLogger;
  let forced: number;
  let closeContext: () => Promise<void>;

  const worker: JobWorker = {
    start: () => undefined,
    stop: () => Promise.resolve(),
    forceStop: () => {
      forced += 1;
      return Promise.resolve();
    },
    describe: () => ({ driver: 'test' }),
  };
  const context = {
    get: (token: symbol) => (token === LOGGER ? logger : worker),
    close: () => closeContext(),
  } as unknown as INestApplicationContext;

  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
    logger = new RecordingLogger();
    forced = 0;
    closeContext = () => Promise.resolve();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is the worker token it asks the context for', () => {
    expect(JOB_WORKER).toBeDefined();
  });

  it('stops without forcing anything when the job finishes within the timeout', async () => {
    const running = runWorker(context, { signals, shutdownTimeoutMs: 1_000 });

    listeners.get('SIGTERM')?.();
    await running.stopped;

    expect(logger.infos.map((entry) => entry.message)).toEqual([
      'Worker started',
      'Worker stopping',
      'Worker stopped',
    ]);
    expect(logger.warnings).toEqual([]);
    expect(forced).toBe(0);
  });

  it('warns, closes the connections at once and rejects when the job outlasts the timeout', async () => {
    closeContext = () => new Promise(() => undefined);
    const running = runWorker(context, { signals, shutdownTimeoutMs: 1_000 });
    const outcome = expect(running.stopped).rejects.toBeInstanceOf(
      WorkerStopTimeoutError,
    );

    listeners.get('SIGTERM')?.();
    await vi.advanceTimersByTimeAsync(999);
    expect(forced).toBe(0);
    await vi.advanceTimersByTimeAsync(1);

    await outcome;
    expect(forced).toBe(1);
    expect(logger.warnings).toEqual([
      { message: 'Worker stop timed out', fields: { timeoutMs: 1_000 } },
    ]);
    expect(logger.infos.map((entry) => entry.message)).toEqual([
      'Worker started',
      'Worker stopping',
    ]);
  });

  it('reports a failed close as "could not stop cleanly" and rejects', async () => {
    closeContext = () => Promise.reject(new Error('redis went away'));
    const running = runWorker(context, { signals, shutdownTimeoutMs: 1_000 });
    const outcome = expect(running.stopped).rejects.toThrow('redis went away');

    listeners.get('SIGINT')?.();

    await outcome;
    expect(logger.warnings).toEqual([
      {
        message: 'Worker could not stop cleanly',
        fields: { error: 'Error: redis went away' },
      },
    ]);
    expect(forced).toBe(0);
  });
});
