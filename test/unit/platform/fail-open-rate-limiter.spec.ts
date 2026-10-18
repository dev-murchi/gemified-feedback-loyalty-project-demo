import { FailOpenRateLimiter } from '../../../src/platform/rate-limit/fail-open-rate-limiter.js';
import type {
  RateLimitDecision,
  RateLimiter,
} from '../../../src/platform/rate-limit/rate-limiter.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const POLICY = { perMinute: 60, burst: 10 };

/** A limiter that fails while `down` is true and otherwise refuses everyone. */
class SwitchableLimiter implements RateLimiter {
  down = false;

  check(): Promise<RateLimitDecision> {
    return this.down
      ? Promise.reject(new Error('connection to 10.0.0.7:6379 refused'))
      : Promise.resolve({ allowed: false, retryAfterSeconds: 7 });
  }
}

describe('FailOpenRateLimiter', () => {
  it('passes the answer of a working limiter through', async () => {
    const limiter = new FailOpenRateLimiter({
      inner: new SwitchableLimiter(),
      logger: new RecordingLogger(),
    });

    expect(await limiter.check('rl:ip:1.2.3.4', POLICY)).toEqual({
      allowed: false,
      retryAfterSeconds: 7,
    });
  });

  it('allows requests while the limiter is down and logs the outage once, not per request', async () => {
    // Given a limiter that is down
    const inner = new SwitchableLimiter();
    inner.down = true;
    const logger = new RecordingLogger();
    const limiter = new FailOpenRateLimiter({ inner, logger });

    // When many requests arrive
    const decisions = [];
    for (let i = 0; i < 25; i += 1)
      decisions.push(await limiter.check('rl:device:d1', POLICY));

    // Then all pass, one warning is logged, and it names no key and no address
    expect(decisions.every((decision) => decision.allowed)).toBe(true);
    expect(logger.warnings).toEqual([
      {
        message: 'Rate limiter unavailable; allowing requests',
        fields: { error: 'Error' },
      },
    ]);
    expect(logger.infos).toEqual([]);
  });

  it('logs once when the limiter answers again, and warns again for a later outage', async () => {
    // Given an outage that ends
    const inner = new SwitchableLimiter();
    const logger = new RecordingLogger();
    const limiter = new FailOpenRateLimiter({ inner, logger });
    inner.down = true;
    await limiter.check('k', POLICY);
    inner.down = false;

    // When it answers several times
    await limiter.check('k', POLICY);
    await limiter.check('k', POLICY);

    // Then the recovery is one info line, and the limit applies again
    expect(logger.infos).toEqual([
      { message: 'Rate limiter available again', fields: {} },
    ]);
    expect((await limiter.check('k', POLICY)).allowed).toBe(false);

    // And a second outage is a second warning
    inner.down = true;
    await limiter.check('k', POLICY);
    expect(logger.warnings).toHaveLength(2);
  });
});
