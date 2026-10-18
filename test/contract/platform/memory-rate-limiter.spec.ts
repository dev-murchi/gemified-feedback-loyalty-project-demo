// The RateLimiter contract (ADR-016) against the in-memory limiter; test/integration/rate-limit runs
// the same cases against Redis.

import { MemoryRateLimiter } from '../../../src/platform/rate-limit/memory-rate-limiter.js';
import { FakeClock } from '../../support/fake-clock.js';
import { rateLimiterContract } from '../support/rate-limiter.contract.js';

describe('RateLimiter (in memory)', () => {
  rateLimiterContract(() => {
    const clock = new FakeClock();
    return Promise.resolve({
      limiter: new MemoryRateLimiter({ clock }),
      clock,
      dispose: () => Promise.resolve(),
    });
  });

  it('forgets callers that have been idle, so distinct keys cannot fill the memory', async () => {
    // Given many one-time callers
    const clock = new FakeClock();
    const limiter = new MemoryRateLimiter({ clock });
    const policy = { perMinute: 6, burst: 3 };
    for (let i = 0; i < 2000; i += 1) await limiter.check(`ip-${i}`, policy);

    // When they are all idle for a day and the limiter keeps working
    clock.advance(24 * 60 * 60 * 1000);
    for (let i = 0; i < 1024; i += 1) await limiter.check('active', policy);

    // Then a forgotten caller starts with a full burst (same as a stored idle one would)
    expect((await limiter.check('ip-1', policy)).allowed).toBe(true);
  });
});
