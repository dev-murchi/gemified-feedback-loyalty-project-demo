// S0-10 slice 5, what makes the limits trustworthy: every operation of the contract is limited
// (a new endpoint without a limit fails here), X-Forwarded-For counts only behind trusted proxies
// (TRUST_PROXY_HOPS), and a limiter that fails lets requests through, logged once.

import { readFileSync } from 'node:fs';
import { inject } from 'vitest';
import { RATE_LIMITER } from '../../src/composition/tokens.js';
import { FailOpenRateLimiter } from '../../src/platform/rate-limit/fail-open-rate-limiter.js';
import type { RateLimiter } from '../../src/platform/rate-limit/rate-limiter.js';
import { B2bApi, DEMO_CLIENTS } from '../support/b2b-api.js';
import { startFeedbackApp } from '../support/feedback-app.js';
import { perSecond, withLimits } from '../support/rate-limit-app.js';
import { startApp } from '../support/start-app.js';

interface Operation {
  readonly method: 'get' | 'post';
  readonly path: string;
  readonly identity: 'none' | 'mobileBearer' | 'b2bOAuth';
  readonly declares429: boolean;
}

interface ContractJson {
  readonly paths: Record<
    string,
    Record<
      string,
      {
        readonly security?: readonly Record<string, unknown>[];
        readonly responses: Record<string, unknown>;
      }
    >
  >;
}

/** Every operation of docs/api/openapi.yaml, with the kind of identity it is called with. */
function operationsOf(contractPath: string): Operation[] {
  const contract = JSON.parse(
    readFileSync(contractPath, 'utf8'),
  ) as ContractJson;
  return Object.entries(contract.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => {
      const scheme = Object.keys(operation.security?.[0] ?? {})[0];
      return {
        method: method as Operation['method'],
        path: path.replace(
          /\{[^}]+\}/g,
          '00000000-0000-4000-8000-000000000000',
        ),
        identity: (scheme ?? 'none') as Operation['identity'],
        declares429: '429' in operation.responses,
      };
    }),
  );
}

describe('every operation of the contract is rate limited', () => {
  const operations = operationsOf(inject('contractPath'));

  it('finds all 12 operations, and the contract declares 429 on each of them', () => {
    expect(operations).toHaveLength(12);
    expect(operations.filter((operation) => !operation.declares429)).toEqual(
      [],
    );
  });

  it('refuses the third call to each of them with 429 RATE_LIMITED', async () => {
    vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
    const feedback = await startFeedbackApp(
      withLimits({
        device: perSecond(2),
        client: perSecond(2),
        ip: perSecond(2),
      }),
    );
    const api = new B2bApi(feedback.running.app);
    // The start-up registration used the IP budget; let every budget fill up again, then sign in
    feedback.running.clock.advance(10_000);
    const tokens = {
      none: undefined,
      mobileBearer: feedback.client.token,
      b2bOAuth: await api.tokenFor('fuel-panel'),
    };

    const notLimited: string[] = [];
    for (const operation of operations) {
      feedback.running.clock.advance(10_000);
      const call = () => {
        const token = tokens[operation.identity];
        const request =
          operation.method === 'get'
            ? api.http().get(operation.path)
            : api.http().post(operation.path).send({});
        return token === undefined
          ? request
          : request.set('Authorization', `Bearer ${token}`);
      };
      const first = await call();
      const second = await call();
      const third = await call();
      const limitedAsExpected =
        first.status !== 429 && second.status !== 429 && third.status === 429;
      if (!limitedAsExpected)
        notLimited.push(`${operation.method} ${operation.path}`);
    }

    expect(notLimited).toEqual([]);
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });
});

describe('X-Forwarded-For (TRUST_PROXY_HOPS)', () => {
  const challenge = (api: B2bApi, forwardedFor: string) =>
    api.http().post('/v1/auth/challenge').set('X-Forwarded-For', forwardedFor);

  it('ignores the header by default: callers behind one socket address share a limit', async () => {
    // Given the default of no trusted proxy
    const running = await startApp(withLimits({ ip: perSecond(2) }));
    const api = new B2bApi(running.app);

    // When three calls claim to come from three different addresses
    const statuses = [
      (await challenge(api, '203.0.113.1')).status,
      (await challenge(api, '203.0.113.2')).status,
      (await challenge(api, '203.0.113.3')).status,
    ];

    // Then the claim is not believed: the third is refused
    expect(statuses).toEqual([200, 200, 429]);
    await running.app.close();
  });

  it('counts the address a trusted proxy appended, so different clients behind it have their own limit', async () => {
    // Given one trusted proxy in front of the API
    const running = await startApp(
      withLimits({ ip: perSecond(2), trustProxyHops: 1 }),
    );
    const api = new B2bApi(running.app);

    // When three different clients, and then one client three times, arrive through it
    const different = [
      (await challenge(api, '203.0.113.1')).status,
      (await challenge(api, '203.0.113.2')).status,
      (await challenge(api, '203.0.113.3')).status,
    ];
    const same = [
      (await challenge(api, '198.51.100.7')).status,
      (await challenge(api, '198.51.100.7')).status,
      (await challenge(api, '198.51.100.7')).status,
    ];

    // Then different clients do not share a limit, and the same client does
    expect(different).toEqual([200, 200, 200]);
    expect(same).toEqual([200, 200, 429]);
    await running.app.close();
  });

  it('cannot be fooled by a client that writes its own header in front of the proxy’s entry', async () => {
    // Given one trusted proxy, which appends the real address to what the client sent
    const running = await startApp(
      withLimits({ ip: perSecond(2), trustProxyHops: 1 }),
    );
    const api = new B2bApi(running.app);

    // When one real client (198.51.100.7) invents a new first entry each time
    const statuses = [
      (await challenge(api, '1.1.1.1, 198.51.100.7')).status,
      (await challenge(api, '2.2.2.2, 198.51.100.7')).status,
      (await challenge(api, '3.3.3.3, 198.51.100.7')).status,
    ];

    // Then it is still one caller
    expect(statuses).toEqual([200, 200, 429]);
    await running.app.close();
  });
});

describe('IPv6 callers (counted by their /64)', () => {
  const challenge = (api: B2bApi, forwardedFor: string) =>
    api.http().post('/v1/auth/challenge').set('X-Forwarded-For', forwardedFor);

  it('lets two addresses of one /64 share a limit', async () => {
    const running = await startApp(
      withLimits({ ip: perSecond(2), trustProxyHops: 1 }),
    );
    const api = new B2bApi(running.app);

    const statuses = [
      (await challenge(api, '2001:db8:1:2::1')).status,
      (await challenge(api, '2001:db8:1:2:aaaa:bbbb:cccc:dddd')).status,
      (await challenge(api, '2001:0db8:0001:0002:0:0:0:99')).status,
    ];

    expect(statuses).toEqual([200, 200, 429]);
    await running.app.close();
  });

  it('gives different /64s a limit each, and keeps IPv4 callers apart', async () => {
    const running = await startApp(
      withLimits({ ip: perSecond(2), trustProxyHops: 1 }),
    );
    const api = new B2bApi(running.app);

    const statuses = [
      (await challenge(api, '2001:db8:1:2::1')).status,
      (await challenge(api, '2001:db8:1:3::1')).status,
      (await challenge(api, '2001:db8:2:2::1')).status,
      (await challenge(api, '203.0.113.1')).status,
      (await challenge(api, '203.0.113.2')).status,
    ];

    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    await running.app.close();
  });
});

describe('a limiter that fails', () => {
  it('lets every request through and logs the outage once', async () => {
    // Given an API whose limiter always fails (Redis is down)
    const failing: RateLimiter = {
      check: () => Promise.reject(new Error('connection refused')),
    };
    const feedback = await startFeedbackApp((builder, { logger }) =>
      builder
        .overrideProvider(RATE_LIMITER)
        .useValue(new FailOpenRateLimiter({ inner: failing, logger })),
    );

    // When a device calls far more often than any limit would allow
    const statuses = [];
    for (let i = 0; i < 200; i += 1)
      statuses.push((await feedback.auth.wallet(feedback.client.token)).status);

    // Then every call is served, and the log has exactly one warning about the limiter
    expect(statuses).toEqual(Array(200).fill(200));
    expect(
      feedback.running.logger.warnings.filter(
        (warning) =>
          warning.message === 'Rate limiter unavailable; allowing requests',
      ),
    ).toHaveLength(1);
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });
});
