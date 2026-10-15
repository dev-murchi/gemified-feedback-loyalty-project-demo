// S0-09 over real HTTP: the OAuth2 token endpoint (RFC 6749 client credentials) and the separation
// of B2B and mobile tokens. Every response is also checked against the contract.

import { B2bApi, DEMO_CLIENTS } from '../support/b2b-api.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';

describe('POST /v1/b2b/oauth/token (e2e)', () => {
  let app: FeedbackApp;
  let api: B2bApi;

  beforeEach(async () => {
    vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
    app = await startFeedbackApp();
    api = new B2bApi(app.running.app);
  });

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  const fuel = DEMO_CLIENTS[0];

  it('issues a 15-minute bearer token with all the client’s scopes, never cached (FR-B2B-01)', async () => {
    const response = await api.token({
      grant_type: 'client_credentials',
      client_id: fuel.clientId,
      client_secret: fuel.secret,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 900,
      scope: 'b2b.feedback.read b2b.summary.read',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers a wrong secret with 401 invalid_client in RFC 6749 form, with a request id (docs/07 §6)', async () => {
    const response = await api.token({
      grant_type: 'client_credentials',
      client_id: fuel.clientId,
      client_secret: 'wrong-secret',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid_client' });
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it.each<{
    case: string;
    fields: Record<string, string>;
    status: number;
    error: string;
  }>([
    {
      case: 'an unknown client',
      fields: {
        grant_type: 'client_credentials',
        client_id: 'nobody',
        client_secret: 'x',
      },
      status: 401,
      error: 'invalid_client',
    },
    {
      case: 'another grant type',
      fields: {
        grant_type: 'password',
        client_id: 'fuel-panel',
        client_secret: 'x',
      },
      status: 400,
      error: 'unsupported_grant_type',
    },
    {
      case: 'a missing secret',
      fields: { grant_type: 'client_credentials', client_id: 'fuel-panel' },
      status: 400,
      error: 'invalid_request',
    },
    {
      case: 'a scope the client lacks',
      fields: {
        grant_type: 'client_credentials',
        client_id: 'fuel-lists',
        client_secret: DEMO_CLIENTS[2].secret,
        scope: 'b2b.summary.read',
      },
      status: 400,
      error: 'invalid_scope',
    },
  ])('refuses $case', async ({ fields, status, error }) => {
    const response = await api.token(fields);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error });
  });

  it('refuses credentials sent as JSON instead of a form', async () => {
    const response = await api.http().post('/v1/b2b/oauth/token').send({
      grant_type: 'client_credentials',
      client_id: fuel.clientId,
      client_secret: fuel.secret,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('keeps B2B and mobile tokens apart in both directions (owner decision 2)', async () => {
    const b2bToken = await api.tokenFor('fuel-panel');

    const mobileOnB2b = await api.get('/v1/b2b/branches', app.client.token);
    const b2bOnMobile = await app.auth.wallet(b2bToken);

    expect(mobileOnB2b.status).toBe(401);
    expect(b2bOnMobile.status).toBe(401);
  });
});
