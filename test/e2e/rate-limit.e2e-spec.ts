// S0-10 slice 5 over real HTTP: the technical rate limits (FR-QR-06, ADR-016). A verified device is
// counted by its device key and a B2B client by its client id, both only after authentication; the
// IP address counts only where there is no identity yet. Every response is also checked against the
// contract, which declares 429 RATE_LIMITED on all 12 operations.

import type { InMemoryStore } from '../../src/composition/in-memory-store.js';
import { IN_MEMORY_STORE } from '../../src/composition/tokens.js';
import {
  REFUSAL_SUMMARY,
  RefusalSummary,
} from '../../src/platform/http/refusal-summary.js';
import { B2bApi, DEMO_CLIENTS } from '../support/b2b-api.js';
import { problemOf } from '../support/auth-client.js';
import { FakeDevice } from '../support/fake-device.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';
import { perSecond, withLimits } from '../support/rate-limit-app.js';
import { ManualScheduler } from '../support/manual-scheduler.js';
import { startApp } from '../support/start-app.js';

const SOMEONE = '00000000-0000-4000-8000-000000000000';

describe('device limit (TC-QR-12)', () => {
  let app: FeedbackApp;

  // Registration at start-up uses the IP budget (two calls), so the IP limit is not under test here.
  beforeEach(async () => {
    app = await startFeedbackApp(withLimits({ device: perSecond(3) }));
  });

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  it('refuses the call over the limit with 429, Retry-After and retryAfterSeconds, then recovers', async () => {
    // Given a device that has used its burst of 3
    for (let i = 0; i < 3; i += 1)
      expect((await app.auth.wallet(app.client.token)).status).toBe(200);

    // When it calls again at once
    const refused = await app.auth.wallet(app.client.token);

    // Then it is told to wait a second, in the header and in the body
    expect(refused.status).toBe(429);
    expect(problemOf(refused).code).toBe('RATE_LIMITED');
    expect(problemOf(refused).retryAfterSeconds).toBe(1);
    expect(refused.headers['retry-after']).toBe('1');
    expect(refused.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );

    // And after that second it is served again
    app.running.clock.advance(1_000);
    expect((await app.auth.wallet(app.client.token)).status).toBe(200);
  });

  it('gives two verified devices behind one IP address a limit each', async () => {
    // Given a second device registered from the same address (all test requests share one)
    const other = new FakeDevice();
    const registered = await app.auth.register(other);
    const otherToken = (registered.body as { accessToken: string }).accessToken;

    // When the first device uses up its burst
    for (let i = 0; i < 3; i += 1) await app.auth.wallet(app.client.token);
    const first = await app.auth.wallet(app.client.token);

    // Then it is refused, and the second device is not affected
    expect(first.status).toBe(429);
    expect((await app.auth.wallet(otherToken)).status).toBe(200);
  });

  it('counts every endpoint of a device against one budget', async () => {
    // When a device uses the wallet, a feedback status and the wallet again
    await app.auth.wallet(app.client.token);
    const status = await app.client.status(SOMEONE);
    await app.auth.wallet(app.client.token);

    // Then the fourth call, to either endpoint, is refused
    expect(status.status).toBe(404);
    expect((await app.client.status(SOMEONE)).status).toBe(429);
  });

  it('does not count a call with an invalid token against anybody', async () => {
    // When ten calls with a bad token arrive
    const bad = [];
    for (let i = 0; i < 10; i += 1) bad.push(await app.auth.wallet('nonsense'));

    // Then they are all plain 401s, and the real device still has its whole burst
    expect(bad.map((response) => response.status)).toEqual(Array(10).fill(401));
    expect((await app.auth.wallet(app.client.token)).status).toBe(200);
  });
});

describe('IP limit before authentication, and never for a verified device', () => {
  let app: FeedbackApp;

  beforeEach(async () => {
    // The start-up registration uses both IP calls
    app = await startFeedbackApp(
      withLimits({ ip: perSecond(2), device: perSecond(50) }),
    );
  });

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  it('refuses a third unauthenticated call from the address, while the verified device is not counted by IP', async () => {
    // Given an address whose IP budget is used up
    const challenge = await app.auth.http().post('/v1/auth/challenge');
    expect(challenge.status).toBe(429);

    // When the verified device calls many times from that very address
    const calls = [];
    for (let i = 0; i < 20; i += 1)
      calls.push((await app.auth.wallet(app.client.token)).status);

    // Then none of its calls is refused for the address
    expect(calls).toEqual(Array(20).fill(200));
  });
});

describe('IP limit on each endpoint without an identity', () => {
  const requests = [
    [
      'POST /v1/auth/challenge',
      (api: B2bApi) => api.http().post('/v1/auth/challenge'),
    ],
    [
      'POST /v1/auth/register',
      (api: B2bApi) => api.http().post('/v1/auth/register').send({}),
    ],
    [
      'POST /v1/auth/session',
      (api: B2bApi) => api.http().post('/v1/auth/session').send({}),
    ],
    [
      'POST /v1/b2b/oauth/token',
      (api: B2bApi) => api.token({ grant_type: 'client_credentials' }),
    ],
  ] as const;

  it.each(requests)(
    'refuses the third call to %s from one address',
    async (_name, call) => {
      // Given an API that allows two such calls at once
      const running = await startApp(withLimits({ ip: perSecond(2) }));
      const api = new B2bApi(running.app);

      // When three calls arrive
      const first = await call(api);
      const second = await call(api);
      const third = await call(api);

      // Then the first two are answered by the endpoint itself, the third is the rate limit
      expect([first.status, second.status]).not.toContain(429);
      expect(third.status).toBe(429);
      expect(third.headers['retry-after']).toBe('1');
      expect(third.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(problemOf(third).code).toBe('RATE_LIMITED');
      await running.app.close();
    },
  );
});

describe('B2B client limit', () => {
  let app: FeedbackApp;
  let api: B2bApi;

  beforeEach(async () => {
    vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
    app = await startFeedbackApp(withLimits({ client: perSecond(2) }));
    api = new B2bApi(app.running.app);
  });

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  it('counts each client on its own, even for two clients of one brand', async () => {
    // Given two tokens, for two clients of the fuel brand, and one for the coffee brand
    const panel = await api.tokenFor('fuel-panel');
    const lists = await api.tokenFor('fuel-lists');
    const coffee = await api.tokenFor('coffee-panel');

    // When the fuel panel uses its burst of 2
    await api.get('/v1/b2b/topics', panel);
    await api.get('/v1/b2b/topics', panel);
    const refused = await api.get('/v1/b2b/topics', panel);

    // Then it is refused, and the other clients are not
    expect(refused.status).toBe(429);
    expect(problemOf(refused).code).toBe('RATE_LIMITED');
    expect(refused.headers['retry-after']).toBe('1');
    expect((await api.get('/v1/b2b/topics', lists)).status).toBe(200);
    expect((await api.get('/v1/b2b/topics', coffee)).status).toBe(200);
  });

  it('limits a client before it is told its scope is missing', async () => {
    // Given a client without the summary scope
    const lists = await api.tokenFor('fuel-lists');
    const summary = `/v1/b2b/branches/${SOMEONE}/summary?from=2026-10-01&to=2026-10-02`;

    // When it asks for the summary again and again
    const answers = [];
    for (let i = 0; i < 4; i += 1)
      answers.push((await api.get(summary, lists)).status);

    // Then the first two are 403, and the rest 429: a flood of denied calls is stopped too
    expect(answers).toEqual([403, 403, 429, 429]);
  });
});

describe('B2B calls the rate limit refused (summary, not audit)', () => {
  const scheduler = new ManualScheduler();
  let app: FeedbackApp;
  let api: B2bApi;

  beforeEach(async () => {
    vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
    app = await startFeedbackApp((builder, context) =>
      withLimits({ client: perSecond(2) })(builder, context)
        .overrideProvider(REFUSAL_SUMMARY)
        .useValue(
          new RefusalSummary({
            logger: context.logger,
            schedule: scheduler.schedule,
          }),
        ),
    );
    api = new B2bApi(app.running.app);
  });

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  const auditEntries = () =>
    app.running.app
      .get<InMemoryStore>(IN_MEMORY_STORE)
      .insights.auditLog.values();
  const summaries = () =>
    app.running.logger.warnings.filter(
      (warning) => warning.message === 'B2B client was rate limited',
    );

  it('keeps refused calls out of the audit log and logs one summary per client and window', async () => {
    // Given a client that is refused four times: three on topics, one on branches
    const token = await api.tokenFor('fuel-panel');
    const answers = [];
    for (const path of [
      '/v1/b2b/topics',
      '/v1/b2b/topics',
      '/v1/b2b/topics',
      '/v1/b2b/topics',
      '/v1/b2b/topics',
      '/v1/b2b/branches',
    ])
      answers.push((await api.get(path, token)).status);
    expect(answers).toEqual([200, 200, 429, 429, 429, 429]);

    // Then only the two calls that were served are in the audit log, and no summary yet
    expect(auditEntries()).toHaveLength(2);
    expect(summaries()).toEqual([]);

    // When the window ends
    scheduler.fireAll();

    // Then there is one summary: the client, its most refused endpoint and the number refused
    expect(summaries().map((summary) => summary.fields)).toEqual([
      { clientId: 'fuel-panel', endpoint: 'GET /v1/b2b/topics', refused: 4 },
    ]);
  });

  it('does not report a client that is never refused, nor one with an invalid token', async () => {
    const token = await api.tokenFor('fuel-panel');
    await api.get('/v1/b2b/topics', token);
    for (let i = 0; i < 6; i += 1) await api.get('/v1/b2b/topics', 'forged');

    scheduler.fireAll();

    expect(summaries()).toEqual([]);
  });

  it('reports a window that is still open when the application stops', async () => {
    const token = await api.tokenFor('fuel-panel');
    for (let i = 0; i < 3; i += 1) await api.get('/v1/b2b/topics', token);
    expect(summaries()).toEqual([]);

    await app.running.app.close();

    expect(summaries()).toHaveLength(1);
  });
});
