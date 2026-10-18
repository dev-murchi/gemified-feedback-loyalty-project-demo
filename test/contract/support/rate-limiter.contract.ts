// The RateLimiter contract (ADR-016): the GCRA arithmetic must be the same in the in-memory limiter
// and in the Redis script, so the same cases run against both.

import type {
  RateLimitPolicy,
  RateLimiter,
} from '../../../src/platform/rate-limit/rate-limiter.js';
import type { FakeClock } from '../../support/fake-clock.js';

export interface RateLimiterHarness {
  readonly limiter: RateLimiter;
  readonly clock: FakeClock;
  dispose(): Promise<void>;
}

/** 6 per minute is one request every 10 seconds, which keeps the arithmetic easy to read. */
const SLOW: RateLimitPolicy = { perMinute: 6, burst: 3 };

export function rateLimiterContract(
  makeHarness: () => Promise<RateLimiterHarness>,
): void {
  let harness: RateLimiterHarness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  afterEach(() => harness.dispose());

  const allowed = async (key: string, policy = SLOW): Promise<boolean> =>
    (await harness.limiter.check(key, policy)).allowed;

  const times = async (n: number, key: string, policy = SLOW) => {
    const results: boolean[] = [];
    for (let i = 0; i < n; i += 1) results.push(await allowed(key, policy));
    return results;
  };

  it('lets exactly `burst` requests through at once, then refuses', async () => {
    // When five requests arrive at the same instant under a burst of three
    const results = await times(5, 'k');

    // Then the first three are allowed and the rest are not
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('tells a refused caller how long to wait, in whole seconds, at least 1', async () => {
    // Given an exhausted burst
    await times(3, 'k');

    // When asking right away, then after 4 s, then after 9.5 s
    const now = await harness.limiter.check('k', SLOW);
    harness.clock.advance(4_000);
    const later = await harness.limiter.check('k', SLOW);
    harness.clock.advance(5_500);
    const almost = await harness.limiter.check('k', SLOW);

    // Then it must wait 10 s, then 6 s, then 1 s (0.5 s is rounded up, never to 0)
    expect(now).toEqual({ allowed: false, retryAfterSeconds: 10 });
    expect(later).toEqual({ allowed: false, retryAfterSeconds: 6 });
    expect(almost).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('allows one request per interval once the burst is used (the sustained rate)', async () => {
    await times(3, 'k');

    harness.clock.advance(9_999);
    const early = await allowed('k');
    harness.clock.advance(1);
    const onTime = await allowed('k');
    const next = await allowed('k');

    expect([early, onTime, next]).toEqual([false, true, false]);
  });

  it('does not charge a refused request: waiting the told time is enough', async () => {
    await times(3, 'k');
    // Given many refused attempts
    await times(20, 'k');

    // When the told 10 seconds have passed
    harness.clock.advance(10_000);

    // Then the next request is allowed (refusals did not push the allowed time away)
    expect(await allowed('k')).toBe(true);
  });

  it('refills a full burst after the caller was idle, and never more than `burst`', async () => {
    await times(3, 'k');

    harness.clock.advance(24 * 60 * 60 * 1000);
    const results = await times(5, 'k');

    expect(results).toEqual([true, true, true, false, false]);
  });

  it('counts every key on its own', async () => {
    await times(3, 'device-a');

    expect(await allowed('device-a')).toBe(false);
    expect(await allowed('device-b')).toBe(true);
  });

  it('uses the policy it is given with each call', async () => {
    const generous: RateLimitPolicy = { perMinute: 6, burst: 5 };

    expect(await times(6, 'k', generous)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('is exact on a fractional interval: a burst of 3 at 180 per minute is whole again after 1000 ms', async () => {
    // Given a rate whose interval (333.33… ms) is not a whole number of milliseconds
    const fractional: RateLimitPolicy = { perMinute: 180, burst: 3 };
    await times(3, 'k', fractional);

    // When exactly three intervals have passed
    harness.clock.advance(1_000);
    const results = await times(4, 'k', fractional);

    // Then all three are due, even though 3 × 333.33… is not exact in floating point
    expect(results).toEqual([true, true, true, false]);
  });

  it('rounds a fractional wait up to the next second: 1000.43 ms is 2 seconds, not 1', async () => {
    // Given 7 per minute (an interval of 8571.43 ms) and a burst of 1, used up
    const rare: RateLimitPolicy = { perMinute: 7, burst: 1 };
    await allowed('k', rare);

    // When the caller asks 7571 ms later, 1000.43 ms before it is due
    harness.clock.advance(7_571);
    const decision = await harness.limiter.check('k', rare);

    // Then the wait is 2 seconds
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 2 });
  });
}
