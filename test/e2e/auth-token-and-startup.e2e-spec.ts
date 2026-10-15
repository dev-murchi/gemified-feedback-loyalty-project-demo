import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/composition/app.module.js';
import { AuthClient, EMPTY_WALLET, problemOf } from '../support/auth-client.js';
import { FakeDevice } from '../support/fake-device.js';
import { startApp, type RunningApp } from '../support/start-app.js';

describe('access token on GET /v1/me/wallet (e2e)', () => {
  let running: RunningApp;
  let client: AuthClient;
  let accessToken: string;

  beforeEach(async () => {
    running = await startApp();
    client = new AuthClient(running.app);
    const registered = await client.register(new FakeDevice());
    accessToken = (registered.body as { accessToken: string }).accessToken;
  });

  afterEach(() => running.app.close());

  it('returns the caller’s wallet for a valid token', async () => {
    const response = await client.wallet(accessToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(EMPTY_WALLET);
  });

  it.each([
    ['no token', undefined],
    ['a garbage token', 'not-a-token'],
    ['a three-part string that is no token', 'x.y.z'],
  ])('answers 401 UNAUTHORIZED for %s', async (_title, token) => {
    const response = await client.wallet(token);

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('UNAUTHORIZED');
  });

  it('answers 401 UNAUTHORIZED once the 15 minutes are over (TC-AUTH-08)', async () => {
    // Given a token that still works one second before its end
    running.clock.advance(899_000);
    expect((await client.wallet(accessToken)).status).toBe(200);

    // When the 15 minutes pass
    running.clock.advance(1_000);

    // Then the same token is refused
    const response = await client.wallet(accessToken);
    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('UNAUTHORIZED');
  });

  it('accepts a new session token after the old one expired', async () => {
    // Given an expired token
    const device = new FakeDevice();
    const registered = await client.register(device);
    running.clock.advance(900_000);
    expect(
      (
        await client.wallet(
          (registered.body as { accessToken: string }).accessToken,
        )
      ).status,
    ).toBe(401);

    // When the device opens a new session
    const session = await client.session(device);

    // Then the new token works
    const fresh = (session.body as { accessToken: string }).accessToken;
    expect((await client.wallet(fresh)).status).toBe(200);
  });
});

describe('start-up configuration (e2e)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const privateKeyPem = () =>
    generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();

  const boot = () =>
    Test.createTestingModule({ imports: [AppModule] }).compile();

  it('refuses to start with the development verifier in production (TC-AUTH-09)', async () => {
    // Given a production configuration that is otherwise complete (signing and raw-text keys set)
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_PRIVATE_KEY', privateKeyPem());
    vi.stubEnv('JWT_KEY_ID', 'prod-1');
    vi.stubEnv('RAW_TEXT_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('RAW_TEXT_KEY_ID', 'prod-1');

    // When the application starts
    // Then it fails because of the development verifier
    await expect(boot()).rejects.toThrow(/DevAttestationVerifier/);
  });

  it('starts with the same configuration outside production', async () => {
    // Given the same configuration with NODE_ENV=test
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_PRIVATE_KEY', privateKeyPem());
    vi.stubEnv('JWT_KEY_ID', 'dev-1');

    // When the application starts
    const app = await boot();

    // Then it boots
    expect(app).toBeDefined();
    await app.close();
  });

  it('warns that a generated signing key is used outside production', async () => {
    // Given no signing key configured
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_PRIVATE_KEY', '');

    // When the application starts
    const running = await startApp();

    // Then it says so, once
    const signingKeyWarnings = running.logger.warnings.filter((warning) =>
      warning.message.startsWith('No JWT_PRIVATE_KEY'),
    );
    expect(signingKeyWarnings).toHaveLength(1);
    await running.app.close();
  });

  it('warns that a generated raw-text key is used outside production', async () => {
    // Given no raw-text master key configured
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('RAW_TEXT_KEY', '');

    // When the application starts
    const running = await startApp();

    // Then it says so, once
    const rawTextKeyWarnings = running.logger.warnings.filter((warning) =>
      warning.message.includes('RAW_TEXT_KEY'),
    );
    expect(rawTextKeyWarnings).toHaveLength(1);
    await running.app.close();
  });
});
