import type { InMemoryStore } from '../../src/composition/in-memory-store.js';
import {
  IN_MEMORY_STORE,
  USER_REPOSITORY,
  WALLET_REPOSITORY,
} from '../../src/composition/tokens.js';
import type { WalletRepository } from '../../src/contexts/gamification/application/ports/wallet-repository.js';
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

const SESSION_SHAPE = {
  userId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
  trustLevel: 'normal',
  accessToken: expect.any(String) as unknown,
  tokenType: 'Bearer',
  expiresIn: 900,
  wallet: EMPTY_WALLET,
};

describe('POST /v1/auth/challenge and /register (e2e)', () => {
  let running: RunningApp;
  let client: AuthClient;
  let device: FakeDevice;

  beforeEach(async () => {
    running = await startApp();
    client = new AuthClient(running.app);
    device = new FakeDevice();
  });

  afterEach(() => running.app.close());

  describe('challenge', () => {
    it('answers a 43-character nonce that expires in 60 seconds, and is not cacheable', async () => {
      // When a challenge is requested
      const response = await client.http().post('/v1/auth/challenge');

      // Then it is the Challenge schema, valid for a minute
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as unknown,
        expiresAt: '2026-10-13T09:01:00.000Z',
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('never repeats a nonce', async () => {
      expect(await client.nonce()).not.toBe(await client.nonce());
    });
  });

  describe('register', () => {
    it.each(['android', 'ios'] as const)(
      'creates a user and an empty wallet for a valid %s attestation (TC-AUTH-01)',
      async (platform) => {
        // When a new device registers
        const response = await client.register(device, { platform });

        // Then 201 with the Session schema, normal trust and an empty wallet
        expect(response.status).toBe(201);
        expect(response.body).toEqual(SESSION_SHAPE);
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('gives the new user a wallet the token can read (user and wallet together)', async () => {
      // Given a registered device
      const registered = await client.register(device);
      const { accessToken } = registered.body as { accessToken: string };

      // When it reads its wallet with the token
      const wallet = await client.wallet(accessToken);

      // Then the wallet exists and is empty
      expect(wallet.status).toBe(200);
      expect(wallet.body).toEqual(EMPTY_WALLET);
    });

    it('returns the existing user with 200 when the same key registers again (FR-AUTH-02)', async () => {
      // Given a registered device
      const first = await client.register(device);

      // When it registers again with a fresh challenge
      const second = await client.register(device);

      // Then it is 200 and the same user, with the same wallet
      expect(second.status).toBe(200);
      expect((second.body as { userId: string }).userId).toBe(
        (first.body as { userId: string }).userId,
      );
      expect((second.body as { wallet: unknown }).wallet).toEqual(EMPTY_WALLET);
    });

    it('opens a low-trust account when the platform check fails (TC-AUTH-04)', async () => {
      const response = await client.register(device, {
        options: { integrity: 'fail' },
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ ...SESSION_SHAPE, trustLevel: 'low' });
    });

    it('rejects a replayed nonce (TC-AUTH-02)', async () => {
      // Given a nonce used for a successful registration
      const nonce = await client.nonce();
      const body = { nonce, ...device.androidEvidence(nonce) };
      await client.http().post('/v1/auth/register').send(body);

      // When the same request is sent again
      const replay = await client.http().post('/v1/auth/register').send(body);

      // Then it is CHALLENGE_INVALID
      expect(replay.status).toBe(401);
      expect(problemOf(replay).code).toBe('CHALLENGE_INVALID');
    });

    it('rejects an expired nonce (TC-AUTH-03)', async () => {
      const nonce = await client.nonce();
      running.clock.advance(60_000);

      const response = await client
        .http()
        .post('/v1/auth/register')
        .send({ nonce, ...device.androidEvidence(nonce) });

      expect(response.status).toBe(401);
      expect(problemOf(response).code).toBe('CHALLENGE_INVALID');
    });

    it('rejects an invalid signature with SIGNATURE_INVALID', async () => {
      const response = await client.register(device, {
        options: { signer: new FakeDevice() },
      });

      expect(response.status).toBe(401);
      expect(problemOf(response).code).toBe('SIGNATURE_INVALID');
    });

    it('names the field of evidence that cannot be read', async () => {
      const response = await client.register(device, {
        tweak: (body) => ({ ...body, integrityToken: '!!' }),
      });

      expect(response.status).toBe(400);
      expect(problemOf(response).errors?.map((error) => error.field)).toEqual([
        'integrityToken',
      ]);
    });

    it.each([
      [
        'an additional property',
        (body: Record<string, unknown>) => ({ ...body, extra: 1 }),
      ],
      [
        'no platform',
        (body: Record<string, unknown>) => without(body, 'platform'),
      ],
      [
        'an unknown platform',
        (body: Record<string, unknown>) => ({ ...body, platform: 'windows' }),
      ],
      [
        'a one-certificate chain',
        (body: Record<string, unknown>) => ({
          ...body,
          certificateChain: ['AAAA'],
        }),
      ],
      ['no nonce', (body: Record<string, unknown>) => without(body, 'nonce')],
    ])('answers 400 VALIDATION_ERROR for %s', async (_title, tweak) => {
      const response = await client.register(device, { tweak });

      expect(response.status).toBe(400);
      expect(problemOf(response).code).toBe('VALIDATION_ERROR');
    });

    it('refuses a revoked key with 403 KEY_REVOKED instead of a session', async () => {
      // Given a registered device whose key was revoked
      await client.register(device);
      const users = running.app.get<UserRepository>(USER_REPOSITORY, {
        strict: false,
      });
      const user = await users.findByKeyIdentifier(
        device.androidKeyIdentifier as KeyIdentifier,
      );
      if (user === undefined) throw new Error('user is not stored');
      user.revokeDeviceKey(
        device.androidKeyIdentifier as KeyIdentifier,
        running.clock.now(),
      );
      const store = running.app.get<InMemoryStore>(IN_MEMORY_STORE, {
        strict: false,
      });
      await store.uow.run(() => users.save(user));

      // When it registers again with a valid signature
      const response = await client.register(device);

      // Then it is refused
      expect(response.status).toBe(403);
      expect(problemOf(response).code).toBe('KEY_REVOKED');
    });
  });
});

describe('registration when the wallet cannot be opened (e2e)', () => {
  it('fails with INTERNAL_ERROR and keeps no user (one transaction)', async () => {
    // Given a wallet store that cannot save
    const brokenWallets: WalletRepository = {
      findById: () => Promise.resolve(undefined),
      findWithLedgerKey: () => Promise.resolve(undefined),
      findLedgerEntry: () => Promise.resolve(undefined),
      save: () => Promise.reject(new Error('wallet store unavailable')),
    };
    const running = await startApp((builder) =>
      builder.overrideProvider(WALLET_REPOSITORY).useValue(brokenWallets),
    );
    const device = new FakeDevice();

    // When a device registers
    const response = await new AuthClient(running.app).register(device);

    // Then the request fails and the user was not kept
    expect(response.status).toBe(500);
    expect(problemOf(response).code).toBe('INTERNAL_ERROR');
    const users = running.app.get<UserRepository>(USER_REPOSITORY, {
      strict: false,
    });
    expect(
      await users.findByKeyIdentifier(
        device.androidKeyIdentifier as KeyIdentifier,
      ),
    ).toBeUndefined();
    await running.app.close();
  });
});
