import type { InMemoryStore } from '../../src/composition/in-memory-store.js';
import {
  IN_MEMORY_STORE,
  USER_REPOSITORY,
} from '../../src/composition/tokens.js';
import type { UserRepository } from '../../src/contexts/identity/application/ports/user-repository.js';
import type { KeyIdentifier } from '../../src/contexts/identity/domain/user/key-identifier.js';
import {
  AuthClient,
  EMPTY_WALLET,
  problemOf,
  without,
} from '../support/auth-client.js';
import { FakeDevice } from '../support/fake-device.js';
import { startApp, type RunningApp } from '../support/start-app.js';

interface SessionBody {
  userId: string;
  trustLevel: string;
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  wallet: unknown;
}

describe('POST /v1/auth/session (e2e)', () => {
  let running: RunningApp;
  let client: AuthClient;
  let device: FakeDevice;

  beforeEach(async () => {
    running = await startApp();
    client = new AuthClient(running.app);
    device = new FakeDevice();
  });

  afterEach(() => running.app.close());

  it.each(['android', 'ios'] as const)(
    'opens a session for a registered %s device with a fresh challenge (FR-AUTH-03)',
    async (platform) => {
      // Given a registered device
      const registered = await client.register(device, { platform });

      // When it signs a new challenge
      const response = await client.session(device, platform);

      // Then it gets the Session for the same user, and its token reads the wallet
      const session = response.body as SessionBody;
      expect(response.status).toBe(200);
      expect(session).toMatchObject({
        userId: (registered.body as SessionBody).userId,
        trustLevel: 'normal',
        tokenType: 'Bearer',
        expiresIn: 900,
        wallet: EMPTY_WALLET,
      });
      expect((await client.wallet(session.accessToken)).status).toBe(200);
    },
  );

  it('keeps a low-trust account low-trust in the session (FR-AUTH-06)', async () => {
    await client.register(device, { options: { integrity: 'fail' } });

    const response = await client.session(device);

    expect((response.body as SessionBody).trustLevel).toBe('low');
  });

  it('rejects a wrong signature with SIGNATURE_INVALID', async () => {
    await client.register(device);

    const response = await client.session(device, 'android', {
      signer: new FakeDevice(),
    });

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('SIGNATURE_INVALID');
  });

  it('answers a key that never registered like a wrong signature', async () => {
    const response = await client.session(device);

    expect(response.status).toBe(401);
    expect(problemOf(response).code).toBe('SIGNATURE_INVALID');
  });

  it('rejects a replayed nonce and an expired one with CHALLENGE_INVALID', async () => {
    // Given a registered device and a nonce used once
    await client.register(device);
    const nonce = await client.nonce();
    const body = {
      platform: 'android',
      keyId: device.androidKeyIdentifier,
      nonce,
      signature: device.sessionProof(nonce),
    };
    await client.http().post('/v1/auth/session').send(body);

    // When it is replayed, and when a fresh one is left to expire
    const replay = await client.http().post('/v1/auth/session').send(body);
    const stale = await client.nonce();
    running.clock.advance(60_000);
    const expired = await client
      .http()
      .post('/v1/auth/session')
      .send({ ...body, nonce: stale, signature: device.sessionProof(stale) });

    // Then both are CHALLENGE_INVALID
    expect([replay.status, problemOf(replay).code]).toEqual([
      401,
      'CHALLENGE_INVALID',
    ]);
    expect([expired.status, problemOf(expired).code]).toEqual([
      401,
      'CHALLENGE_INVALID',
    ]);
  });

  it('refuses a revoked key with 403 KEY_REVOKED (TC-AUTH-06)', async () => {
    // Given a registered device whose key was revoked
    await client.register(device);
    const users = running.app.get<UserRepository>(USER_REPOSITORY, {
      strict: false,
    });
    const store = running.app.get<InMemoryStore>(IN_MEMORY_STORE, {
      strict: false,
    });
    const key = device.androidKeyIdentifier as KeyIdentifier;
    const user = await users.findByKeyIdentifier(key);
    if (user === undefined) throw new Error('user is not stored');
    user.revokeDeviceKey(key, running.clock.now());
    await store.uow.run(() => users.save(user));

    // When it opens a session
    const response = await client.session(device);

    // Then it is refused
    expect(response.status).toBe(403);
    expect(problemOf(response).code).toBe('KEY_REVOKED');
  });

  it.each([
    [
      'no platform',
      (body: Record<string, unknown>) => without(body, 'platform'),
    ],
    ['no keyId', (body: Record<string, unknown>) => without(body, 'keyId')],
    [
      'no signature for android',
      (body: Record<string, unknown>) => without(body, 'signature'),
    ],
    [
      'an unknown platform',
      (body: Record<string, unknown>) => ({ ...body, platform: 'windows' }),
    ],
  ])('answers 400 VALIDATION_ERROR for %s', async (_title, tweak) => {
    const nonce = await client.nonce();
    const body = {
      platform: 'android',
      keyId: device.androidKeyIdentifier,
      nonce,
      signature: device.sessionProof(nonce),
    };

    const response = await client
      .http()
      .post('/v1/auth/session')
      .send(tweak(body));

    expect(response.status).toBe(400);
    expect(problemOf(response).code).toBe('VALIDATION_ERROR');
  });

  it('answers a malformed keyId with 400 and does not use up the nonce', async () => {
    await client.register(device);
    const nonce = await client.nonce();
    const proof = device.sessionProof(nonce);

    const bad = await client
      .http()
      .post('/v1/auth/session')
      .send({ platform: 'android', keyId: '??', nonce, signature: proof });
    const good = await client.http().post('/v1/auth/session').send({
      platform: 'android',
      keyId: device.androidKeyIdentifier,
      nonce,
      signature: proof,
    });

    expect(bad.status).toBe(400);
    expect(good.status).toBe(200);
  });

  it('answers a body over 8 KB with 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await client
      .http()
      .post('/v1/auth/session')
      .send({ padding: 'x'.repeat(9 * 1024) });

    expect(response.status).toBe(413);
    expect(problemOf(response).code).toBe('PAYLOAD_TOO_LARGE');
  });
});
