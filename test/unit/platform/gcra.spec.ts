import {
  gcra,
  retryAfterSecondsOf,
} from '../../../src/platform/rate-limit/gcra.js';

const POLICY = { perMinute: 120, burst: 30 };
const INTERVAL = 500;
const T0 = 1_760_000_000_000;

describe('gcra (ADR-016)', () => {
  it('allows the first request of an idle caller and moves the arrival time one interval ahead', () => {
    const result = gcra(undefined, T0, POLICY);

    expect(result).toEqual({ allowed: true, tat: T0 + INTERVAL });
  });

  it('accepts the 30th request of a burst and refuses the 31st', () => {
    let tat: number | undefined;
    for (let i = 1; i <= 30; i += 1) {
      const result = gcra(tat, T0, POLICY);
      expect(result.allowed).toBe(true);
      tat = result.allowed ? result.tat : tat;
    }

    expect(gcra(tat, T0, POLICY)).toEqual({ allowed: false, waitMs: 500 });
  });

  it('measures the wait from the allowed time, not from the last request', () => {
    // Given a bucket that is empty: 30 intervals ahead
    const tat = T0 + 30 * INTERVAL;

    // When 200 ms later the caller asks again
    const result = gcra(tat, T0 + 200, POLICY);

    // Then it must wait the rest of the interval
    expect(result).toEqual({ allowed: false, waitMs: 300 });
  });

  it('forgets a stored time that lies in the past: an idle caller does not bank requests', () => {
    const result = gcra(T0 - 3_600_000, T0, POLICY);

    expect(result).toEqual({ allowed: true, tat: T0 + INTERVAL });
  });

  it('does not refuse a request that is exactly due because of floating-point error', () => {
    // Given 90 per minute (an interval of 666.66… ms) and a burst of 3 used up at T0
    const policy = { perMinute: 90, burst: 3 };
    let tat: number | undefined;
    for (let i = 0; i < 3; i += 1) {
      const result = gcra(tat, T0, policy);
      tat = result.allowed ? result.tat : tat;
    }

    // When exactly three intervals (2000 ms) later three requests arrive
    const later = [0, 1, 2].map(() => {
      const result = gcra(tat, T0 + 2_000, policy);
      tat = result.allowed ? result.tat : tat;
      return result.allowed;
    });

    // Then all three are due, although 3 × 666.66… in floating point is 0.0005 ms too late
    expect(later).toEqual([true, true, true]);
  });

  it('turns a wait into whole seconds, rounded up, never below 1', () => {
    expect(retryAfterSecondsOf(1)).toBe(1);
    expect(retryAfterSecondsOf(1_000)).toBe(1);
    expect(retryAfterSecondsOf(1_001)).toBe(2);
    expect(retryAfterSecondsOf(59_500)).toBe(60);
  });
});
