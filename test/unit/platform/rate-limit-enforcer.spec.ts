import { RateLimitEnforcer } from '../../../src/platform/http/rate-limit.enforcer.js';
import type {
  RateLimitDecision,
  RateLimitPolicy,
  RateLimiter,
} from '../../../src/platform/rate-limit/rate-limiter.js';

const POLICIES = {
  device: { perMinute: 120, burst: 30 },
  client: { perMinute: 600, burst: 100 },
  ip: { perMinute: 300, burst: 100 },
} as const;

/** Records what it is asked and answers from a script. */
class RecordingLimiter implements RateLimiter {
  readonly asked: { key: string; policy: RateLimitPolicy }[] = [];
  decision: RateLimitDecision = { allowed: true };

  check(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    this.asked.push({ key, policy });
    return Promise.resolve(this.decision);
  }
}

describe('RateLimitEnforcer', () => {
  it('counts a device by its device key with the device policy', async () => {
    const limiter = new RecordingLimiter();

    await new RateLimitEnforcer({ limiter, policies: POLICIES }).device(
      'key-1',
    );

    expect(limiter.asked).toEqual([
      { key: 'rl:device:key-1', policy: POLICIES.device },
    ]);
  });

  it('counts a B2B client by its client id with the client policy', async () => {
    const limiter = new RecordingLimiter();

    await new RateLimitEnforcer({ limiter, policies: POLICIES }).client(
      'fuel-panel',
    );

    expect(limiter.asked).toEqual([
      { key: 'rl:client:fuel-panel', policy: POLICIES.client },
    ]);
  });

  it('counts an unauthenticated caller by IP address with the IP policy', async () => {
    const limiter = new RecordingLimiter();

    await new RateLimitEnforcer({ limiter, policies: POLICIES }).ip(
      '203.0.113.9',
    );

    expect(limiter.asked).toEqual([
      { key: 'rl:ip:203.0.113.9', policy: POLICIES.ip },
    ]);
  });

  it('reports a caller over the limit as RATE_LIMITED with the wait in seconds', async () => {
    const limiter = new RecordingLimiter();
    limiter.decision = { allowed: false, retryAfterSeconds: 12 };

    const counted = await new RateLimitEnforcer({
      limiter,
      policies: POLICIES,
    }).device('key-1');

    expect(counted).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: 12 },
    });
  });

  it('reports a caller within the limit as ok', async () => {
    const counted = await new RateLimitEnforcer({
      limiter: new RecordingLimiter(),
      policies: POLICIES,
    }).ip('203.0.113.9');

    expect(counted.ok).toBe(true);
  });
});
