import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { retryOnConflict } from '../../../src/shared-kernel/retry-on-conflict.js';

/** An attempt that throws the given errors in order, then succeeds, and counts its calls. */
function attempts(...failures: Error[]) {
  let calls = 0;
  const attempt = (): Promise<string> => {
    const failure = failures[calls];
    calls += 1;
    return failure === undefined
      ? Promise.resolve('done')
      : Promise.reject(failure);
  };
  return { attempt, calls: () => calls };
}

describe('retryOnConflict', () => {
  it('returns the outcome when there is no conflict', async () => {
    // Given an attempt that succeeds
    const { attempt, calls } = attempts();

    // When it is run with retry
    const outcome = await retryOnConflict(attempt);

    // Then it ran once
    expect(outcome).toBe('done');
    expect(calls()).toBe(1);
  });

  it('runs the attempt once more after a conflict', async () => {
    // Given an attempt that conflicts once
    const { attempt, calls } = attempts(new ConcurrencyConflictError('a-1'));

    // When it is run with retry
    const outcome = await retryOnConflict(attempt);

    // Then the second run's outcome is returned
    expect(outcome).toBe('done');
    expect(calls()).toBe(2);
  });

  it('rethrows a second conflict', async () => {
    // Given an attempt that conflicts twice
    const { attempt, calls } = attempts(
      new ConcurrencyConflictError('a-1'),
      new ConcurrencyConflictError('a-1'),
    );

    // When it is run with retry
    const run = retryOnConflict(attempt);

    // Then the conflict reaches the caller after two runs
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(calls()).toBe(2);
  });

  it('does not retry any other error', async () => {
    // Given an attempt that fails for another reason
    const failure = new Error('database unreachable');
    const { attempt, calls } = attempts(failure);

    // When it is run with retry
    const run = retryOnConflict(attempt);

    // Then the same error is rethrown after one run
    await expect(run).rejects.toBe(failure);
    expect(calls()).toBe(1);
  });
});
