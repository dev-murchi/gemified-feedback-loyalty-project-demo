import type { KeyIdentifier } from '../../../src/contexts/identity/domain/user/key-identifier.js';
import type { CreateSessionError } from '../../../src/contexts/identity/application/use-cases/create-session.js';
import { CHALLENGE_TTL_MS } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import type { Result } from '../../../src/shared-kernel/result.js';
import { FakeDevice, type EvidenceOptions } from '../../support/fake-device.js';
import { USER_ID } from '../../support/identity-builders.js';
import {
  registrationFixture,
  type RegistrationFixture,
} from '../../support/registration-fixture.js';

const errorOf = (result: Result<unknown, CreateSessionError>) =>
  result.ok ? undefined : result.error;

describe('CreateSession', () => {
  let fixture: RegistrationFixture;
  let device: FakeDevice;

  /** Registers the device (Android by default) and returns the user's key identifier. */
  const register = async (
    platform: 'android' | 'ios' = 'android',
    options: EvidenceOptions = {},
  ) => {
    const nonce = await fixture.issueNonce();
    await fixture.registerDevice.execute({
      nonce,
      evidence:
        platform === 'ios'
          ? device.iosEvidence(nonce, options)
          : device.androidEvidence(nonce, options),
    });
    fixture.tokens.issued.length = 0;
  };

  const openSession = async (
    options: EvidenceOptions = {},
    overrides: { platform?: 'android' | 'ios'; keyId?: string } = {},
  ) => {
    const platform = overrides.platform ?? 'android';
    const nonce = await fixture.issueNonce();
    return fixture.createSession.execute({
      platform,
      keyId:
        overrides.keyId ??
        (platform === 'ios' ? device.iosKeyId : device.androidKeyIdentifier),
      nonce,
      proof: device.sessionProof(nonce, options),
    });
  };

  beforeEach(async () => {
    fixture = await registrationFixture();
    device = new FakeDevice();
  });

  it.each(['android', 'ios'] as const)(
    'opens a session for a registered %s device (FR-AUTH-03)',
    async (platform) => {
      // Given a registered device
      await register(platform);

      // When it signs a fresh challenge
      const result = await openSession({}, { platform });

      // Then it gets a 15-minute token for its user, key and trust level
      expect(result).toMatchObject({
        ok: true,
        value: { userId: USER_ID, trustLevel: 'normal', expiresIn: 900 },
      });
      expect(fixture.tokens.issued).toEqual([
        {
          userId: USER_ID,
          keyIdentifier:
            platform === 'ios' ? device.iosKeyId : device.androidKeyIdentifier,
          trustLevel: 'normal',
        },
      ]);
    },
  );

  it('carries a low trust level into the token (FR-AUTH-06)', async () => {
    // Given a device registered with a failed platform check
    await register('android', { integrity: 'fail' });

    // When it opens a session
    const result = await openSession();

    // Then the token says low trust
    expect(result.ok && result.value.trustLevel).toBe('low');
    expect(fixture.tokens.issued[0]?.trustLevel).toBe('low');
  });

  describe('a signature that does not prove the key', () => {
    beforeEach(async () => {
      await register();
    });

    it.each([
      ['a signature over the raw nonce', 'rawNonce'],
      ['a raw r‖s signature', 'rawSignature'],
      ['a signature by another key', 'otherKey'],
    ])('is rejected: %s', async (_title, kind) => {
      // When the session is opened with a bad proof
      const options: EvidenceOptions =
        kind === 'rawSignature'
          ? { rawSignature: true }
          : kind === 'otherKey'
            ? { signer: new FakeDevice() }
            : { signedMessage: Buffer.from('x'.repeat(43)) };
      const result = await openSession(options);

      // Then it is SIGNATURE_INVALID and no token was minted
      expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
      expect(fixture.tokens.issued).toEqual([]);
    });

    it('is rejected when the proof is not base64 at all', async () => {
      const nonce = await fixture.issueNonce();
      const result = await fixture.createSession.execute({
        platform: 'android',
        keyId: device.androidKeyIdentifier,
        nonce,
        proof: '***',
      });
      expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });

    it('uses the nonce up, so a failed attempt cannot be retried with it (T-S4)', async () => {
      // Given a failed attempt
      const nonce = await fixture.issueNonce();
      const keyId = device.androidKeyIdentifier;
      await fixture.createSession.execute({
        platform: 'android',
        keyId,
        nonce,
        proof: device.sessionProof(nonce, { signer: new FakeDevice() }),
      });

      // When the right signature is sent with the same nonce
      const retry = await fixture.createSession.execute({
        platform: 'android',
        keyId,
        nonce,
        proof: device.sessionProof(nonce),
      });

      // Then the nonce is gone
      expect(errorOf(retry)).toEqual({ code: 'CHALLENGE_INVALID' });
    });
  });

  describe('a key that is not on file', () => {
    it('answers like a wrong signature, so keys cannot be probed', async () => {
      // Given a device that never registered
      // When it signs a challenge
      const result = await openSession();

      // Then it is SIGNATURE_INVALID, not NOT_FOUND
      expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });

    it('also answers SIGNATURE_INVALID when the platform differs from the registered one', async () => {
      // Given an Android device that claims to be iOS
      await register('android');

      // When it opens a session as iOS with the right key and signature
      const result = await openSession(
        {},
        { platform: 'ios', keyId: device.androidKeyIdentifier },
      );

      // Then it is rejected
      expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });
  });

  describe('the challenge', () => {
    it('must be live: a replayed nonce is CHALLENGE_INVALID (TC-AUTH-02)', async () => {
      // Given a nonce used for a successful session
      await register();
      const nonce = await fixture.issueNonce();
      const command = {
        platform: 'android' as const,
        keyId: device.androidKeyIdentifier,
        nonce,
        proof: device.sessionProof(nonce),
      };
      await fixture.createSession.execute(command);

      // When it is used again
      const replay = await fixture.createSession.execute(command);

      // Then it is rejected
      expect(errorOf(replay)).toEqual({ code: 'CHALLENGE_INVALID' });
    });

    it('must not be expired (TC-AUTH-03)', async () => {
      // Given a nonce whose 60 seconds have passed
      await register();
      const nonce = await fixture.issueNonce();
      fixture.clock.advance(CHALLENGE_TTL_MS);

      // When it is used
      const result = await fixture.createSession.execute({
        platform: 'android',
        keyId: device.androidKeyIdentifier,
        nonce,
        proof: device.sessionProof(nonce),
      });

      // Then it is rejected
      expect(errorOf(result)).toEqual({ code: 'CHALLENGE_INVALID' });
    });
  });

  it('reports a malformed keyId as a validation error and keeps the nonce', async () => {
    // Given a registered device and a request with a garbage keyId
    await register();
    const nonce = await fixture.issueNonce();
    const proof = device.sessionProof(nonce);
    const bad = await fixture.createSession.execute({
      platform: 'android',
      keyId: '??',
      nonce,
      proof,
    });

    // When the corrected request uses the same nonce
    const fixed = await fixture.createSession.execute({
      platform: 'android',
      keyId: device.androidKeyIdentifier,
      nonce,
      proof,
    });

    // Then the format error did not burn the nonce
    expect(errorOf(bad)).toEqual({ code: 'VALIDATION_ERROR', field: 'keyId' });
    expect(fixed.ok).toBe(true);
  });

  describe('a revoked key (TC-AUTH-06, FR-AUTH-07)', () => {
    beforeEach(async () => {
      await register();
      await fixture.identity.uow.run(async () => {
        const user = await fixture.identity.users.findById(USER_ID);
        if (user === undefined) throw new Error('user is not stored');
        user.revokeDeviceKey(
          device.androidKeyIdentifier as KeyIdentifier,
          new Date('2026-10-13T08:00:00.000Z'),
        );
        await fixture.identity.users.save(user);
      });
    });

    it('is refused with KEY_REVOKED once the signature verified, and gets no token', async () => {
      // When the holder of the revoked key opens a session
      const result = await openSession();

      // Then it is KEY_REVOKED and nothing was minted
      expect(errorOf(result)).toEqual({ code: 'KEY_REVOKED' });
      expect(fixture.tokens.issued).toEqual([]);
    });

    it('stays SIGNATURE_INVALID for someone who cannot sign', async () => {
      // When a stranger who knows the key identifier tries
      const result = await openSession({ signer: new FakeDevice() });

      // Then the revoked state is not revealed
      expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });
  });
});
