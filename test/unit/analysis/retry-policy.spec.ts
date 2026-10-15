import { RetryPolicy } from '../../../src/contexts/analysis/domain/retry/retry-policy.js';
import { minutesAfter, SUBMITTED_AT } from '../../support/analysis-builders.js';

const policy = new RetryPolicy();
const HOUR = 60;

describe('RetryPolicy (FR-AI-05)', () => {
  it('waits one minute after the first failure, then doubles', () => {
    const now = minutesAfter(10);

    expect(policy.nextAttemptAt(1, now, SUBMITTED_AT)).toEqual(
      minutesAfter(11),
    );
    expect(policy.nextAttemptAt(2, now, SUBMITTED_AT)).toEqual(
      minutesAfter(12),
    );
    expect(policy.nextAttemptAt(3, now, SUBMITTED_AT)).toEqual(
      minutesAfter(14),
    );
    expect(policy.nextAttemptAt(6, now, SUBMITTED_AT)).toEqual(
      minutesAfter(42),
    );
  });

  it('waits at most one hour, however many attempts failed', () => {
    const now = minutesAfter(10);

    expect(policy.nextAttemptAt(7, now, SUBMITTED_AT)).toEqual(
      minutesAfter(70),
    );
    expect(policy.nextAttemptAt(40, now, SUBMITTED_AT)).toEqual(
      minutesAfter(70),
    );
  });

  it('counts the 24 hours from the submission, not from the first attempt', () => {
    // A first attempt 23:30 after submission leaves only 30 minutes
    const now = minutesAfter(23 * HOUR + 30);

    expect(policy.nextAttemptAt(1, now, SUBMITTED_AT)).toEqual(
      minutesAfter(23 * HOUR + 31),
    );
    expect(policy.nextAttemptAt(7, now, SUBMITTED_AT)).toBeNull();
  });

  it('schedules the last retry strictly before submittedAt + 24 h', () => {
    // A retry that would land exactly on the deadline is not scheduled
    expect(
      policy.nextAttemptAt(1, minutesAfter(24 * HOUR - 1), SUBMITTED_AT),
    ).toBeNull();
    expect(
      policy.nextAttemptAt(1, minutesAfter(24 * HOUR - 2), SUBMITTED_AT),
    ).toEqual(minutesAfter(24 * HOUR - 1));
  });

  it('allows attempts only before the deadline', () => {
    expect(policy.deadlineOf(SUBMITTED_AT)).toEqual(minutesAfter(24 * HOUR));
    expect(
      policy.allowsAttemptAt(minutesAfter(24 * HOUR - 1), SUBMITTED_AT),
    ).toBe(true);
    expect(policy.allowsAttemptAt(minutesAfter(24 * HOUR), SUBMITTED_AT)).toBe(
      false,
    );
  });
});
