import type { Authenticator } from '../../../src/platform/http/bearer-auth.guard.js';
import type { ClientAuthenticator } from '../../../src/platform/http/client-auth.guard.js';
import { RateLimitEnforcer } from '../../../src/platform/http/rate-limit.enforcer.js';
import {
  withClientLimit,
  withDeviceLimit,
} from '../../../src/platform/http/rate-limited-authenticators.js';
import type {
  RateLimitDecision,
  RateLimiter,
} from '../../../src/platform/rate-limit/rate-limiter.js';
import type { RefusalSummary } from '../../../src/platform/http/refusal-summary.js';
import { err, ok } from '../../../src/shared-kernel/result.js';

const POLICY = { perMinute: 60, burst: 5 };

class RecordingLimiter implements RateLimiter {
  readonly keys: string[] = [];
  decision: RateLimitDecision = { allowed: true };

  check(key: string): Promise<RateLimitDecision> {
    this.keys.push(key);
    return Promise.resolve(this.decision);
  }
}

const enforcerOver = (limiter: RateLimiter) =>
  new RateLimitEnforcer({
    limiter,
    policies: { device: POLICY, client: POLICY, ip: POLICY },
  });

const device: Authenticator = {
  authenticate: (authorization) =>
    Promise.resolve(
      authorization === 'Bearer good'
        ? ok({
            userId: 'user-1',
            keyIdentifier: 'key-1',
            trustLevel: 'normal' as const,
          })
        : err({ code: 'UNAUTHORIZED' }),
    ),
};

const client: ClientAuthenticator = {
  authenticate: (authorization) =>
    Promise.resolve(
      authorization === 'Bearer good'
        ? ok({ clientId: 'fuel-panel', brandId: 'brand-1', scopes: [] })
        : err({ code: 'UNAUTHORIZED' }),
    ),
};

describe('withDeviceLimit', () => {
  it('counts a verified device by its device key, not by its user', async () => {
    const limiter = new RecordingLimiter();

    const caller = await withDeviceLimit(
      device,
      enforcerOver(limiter),
    ).authenticate('Bearer good');

    expect(caller.ok).toBe(true);
    expect(limiter.keys).toEqual(['rl:device:key-1']);
  });

  it('does not count a caller that is not verified', async () => {
    const limiter = new RecordingLimiter();

    const caller = await withDeviceLimit(
      device,
      enforcerOver(limiter),
    ).authenticate('Bearer forged');

    expect(caller).toEqual({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(limiter.keys).toEqual([]);
  });

  it('answers RATE_LIMITED, with the wait, for a verified device over its limit', async () => {
    const limiter = new RecordingLimiter();
    limiter.decision = { allowed: false, retryAfterSeconds: 4 };

    const caller = await withDeviceLimit(
      device,
      enforcerOver(limiter),
    ).authenticate('Bearer good');

    expect(caller).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: 4 },
    });
  });
});

const ENDPOINT = 'GET /v1/b2b/topics';

/** What the decorator reports to the RefusalSummary, recorded instead of logged. */
const recordingSummary = () => {
  const refusals: { clientId: string; endpoint: string }[] = [];
  const summary = {
    refused: (clientId: string, endpoint: string): void => {
      refusals.push({ clientId, endpoint });
    },
  } as unknown as RefusalSummary;
  return { summary, refusals };
};

describe('withClientLimit', () => {
  it('counts a verified B2B client by its client id, not by its brand', async () => {
    const limiter = new RecordingLimiter();

    const caller = await withClientLimit(
      client,
      enforcerOver(limiter),
      recordingSummary().summary,
    ).authenticate('Bearer good', ENDPOINT);

    expect(caller.ok).toBe(true);
    expect(limiter.keys).toEqual(['rl:client:fuel-panel']);
  });

  it('does not count or report a caller that is not verified', async () => {
    const limiter = new RecordingLimiter();
    limiter.decision = { allowed: false, retryAfterSeconds: 2 };
    const recorded = recordingSummary();

    const caller = await withClientLimit(
      client,
      enforcerOver(limiter),
      recorded.summary,
    ).authenticate('Bearer forged', ENDPOINT);

    expect(caller).toEqual({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(limiter.keys).toEqual([]);
    expect(recorded.refusals).toEqual([]);
  });

  it('answers RATE_LIMITED and reports the refusal with the client and the endpoint', async () => {
    const limiter = new RecordingLimiter();
    limiter.decision = { allowed: false, retryAfterSeconds: 2 };
    const recorded = recordingSummary();

    const caller = await withClientLimit(
      client,
      enforcerOver(limiter),
      recorded.summary,
    ).authenticate('Bearer good', ENDPOINT);

    expect(caller).toEqual({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterSeconds: 2 },
    });
    expect(recorded.refusals).toEqual([
      { clientId: 'fuel-panel', endpoint: ENDPOINT },
    ]);
  });

  it('reports nothing for a call that is allowed', async () => {
    const recorded = recordingSummary();

    await withClientLimit(
      client,
      enforcerOver(new RecordingLimiter()),
      recorded.summary,
    ).authenticate('Bearer good', ENDPOINT);

    expect(recorded.refusals).toEqual([]);
  });
});
