import { DevRequestProofVerifier } from '../../../src/contexts/identity/adapters/outbound/dev-request-proof.verifier.js';
import { VerifyPlatformProof } from '../../../src/contexts/identity/application/use-cases/verify-platform-proof.js';
import type { KeyIdentifier } from '../../../src/contexts/identity/domain/user/key-identifier.js';
import type { PublicKey } from '../../../src/contexts/identity/domain/user/public-key.js';
import type { PlatformProofRequest } from '../../../src/contexts/identity/public/platform-proof-verifier.js';
import { FakeDevice } from '../../support/fake-device.js';
import {
  aUser,
  OTHER_USER_ID,
  USER_ID,
} from '../../support/identity-builders.js';
import {
  memoryIdentityHarness,
  type IdentityHarness,
} from '../../support/memory-identity.js';

const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';
const OTHER_IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222';
const BODY = Buffer.from(
  '{"qrToken":"Kp3vX9qL2mT7wR4yB8nZ1cF6hJ0sD5aE","text":"Tuvaletler çok kirliydi, sabun yoktu."}',
  'utf8',
);

describe('VerifyPlatformProof (PlatformProofVerifier, FR-QR-10)', () => {
  let harness: IdentityHarness;
  let device: FakeDevice;
  let verifier: VerifyPlatformProof;

  const requestWith = (
    overrides: Partial<PlatformProofRequest> = {},
  ): PlatformProofRequest => ({
    userId: USER_ID,
    keyIdentifier: device.androidKeyIdentifier,
    idempotencyKey: IDEMPOTENCY_KEY,
    body: BODY,
    proof: device.requestProof(IDEMPOTENCY_KEY, BODY),
    ...overrides,
  });

  beforeEach(async () => {
    // Given a user registered with this device's real P-256 key
    harness = await memoryIdentityHarness();
    device = new FakeDevice();
    const user = aUser({
      keyIdentifier: device.androidKeyIdentifier as KeyIdentifier,
      publicKey: device.publicKeyDer.toString('base64') as PublicKey,
    });
    await harness.uow.run(() => harness.users.save(user));
    verifier = new VerifyPlatformProof({
      users: harness.users,
      proofs: DevRequestProofVerifier.forEnvironment('test'),
    });
  });

  it('accepts a proof over the key and the body, made with the session’s device key', async () => {
    expect(await verifier.verify(requestWith())).toBe('valid');
  });

  it.each<[string, () => Partial<PlatformProofRequest>]>([
    ['there is no proof', () => ({ proof: undefined })],
    [
      'the body was changed after signing (TC-AUTH-07)',
      () => ({ body: Buffer.from(`${BODY.toString('utf8')} `, 'utf8') }),
    ],
    [
      'the same body is sent again under a new Idempotency-Key',
      () => ({ idempotencyKey: OTHER_IDEMPOTENCY_KEY }),
    ],
    [
      'another device signed it',
      () => ({
        proof: device.requestProof(IDEMPOTENCY_KEY, BODY, {
          signer: new FakeDevice(),
        }),
      }),
    ],
    [
      'the signature is raw r‖s instead of DER',
      () => ({
        proof: device.requestProof(IDEMPOTENCY_KEY, BODY, {
          rawSignature: true,
        }),
      }),
    ],
    ['the proof is not base64', () => ({ proof: 'not base64!' })],
    [
      'the session’s key is not one of the user’s keys',
      () => ({ keyIdentifier: new FakeDevice().androidKeyIdentifier }),
    ],
    ['the key identifier is malformed', () => ({ keyIdentifier: '???' })],
    ['the user is unknown', () => ({ userId: OTHER_USER_ID })],
  ])('is invalid when %s', async (_case, overrides) => {
    expect(await verifier.verify(requestWith(overrides()))).toBe('invalid');
  });

  it('is invalid once the key is revoked, although the token still works (SDD 7.1, FR-AUTH-07)', async () => {
    // Given the user's key is revoked after the session was opened
    const user = await harness.users.findById(USER_ID);
    if (user === undefined) throw new Error('user is not stored');
    user.revokeDeviceKey(
      device.androidKeyIdentifier as KeyIdentifier,
      new Date('2026-10-12T10:00:00.000Z'),
    );
    await harness.uow.run(() => harness.users.save(user));

    // Then a correctly signed request earns no reward
    expect(await verifier.verify(requestWith())).toBe('invalid');
  });

  it('refuses to start in production (TC-AUTH-09)', () => {
    expect(() => DevRequestProofVerifier.forEnvironment('production')).toThrow(
      'DevRequestProofVerifier must not be used with NODE_ENV=production',
    );
  });
});
