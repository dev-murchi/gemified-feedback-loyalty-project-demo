import type { UserRepository } from '../../../src/contexts/identity/application/ports/user-repository.js';
import type { RegisterDeviceError } from '../../../src/contexts/identity/application/use-cases/register-device.js';
import type { Result } from '../../../src/shared-kernel/result.js';
import type { KeyIdentifier } from '../../../src/contexts/identity/domain/user/key-identifier.js';
import { CHALLENGE_TTL_MS } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import { FakeDevice } from '../../support/fake-device.js';
import { USER_ID } from '../../support/identity-builders.js';
import {
  registrationFixture,
  type RegistrationFixture,
} from '../../support/registration-fixture.js';

const errorOf = (result: Result<unknown, RegisterDeviceError>) =>
  result.ok ? undefined : result.error;

describe('RegisterDevice', () => {
  let fixture: RegistrationFixture;
  let device: FakeDevice;

  beforeEach(async () => {
    fixture = await registrationFixture();
    device = new FakeDevice();
  });

  const registerAndroid = async (options = {}, dev = device) => {
    const nonce = await fixture.issueNonce();
    return fixture.registerDevice.execute({
      nonce,
      evidence: dev.androidEvidence(nonce, options),
    });
  };

  it('creates a user with normal trust for a valid attestation (TC-AUTH-01, FR-AUTH-01)', async () => {
    // When a device registers
    const result = await registerAndroid();

    // Then a new user exists, found by the device key, and UserRegistered was published
    expect(result).toMatchObject({
      ok: true,
      value: { userId: USER_ID, trustLevel: 'normal', created: true },
    });
    const stored = await fixture.identity.users.findByKeyIdentifier(
      device.androidKeyIdentifier as KeyIdentifier,
    );
    expect(stored?.id).toBe(USER_ID);
    expect(
      fixture.identity.delivered.map((event) => event.aggregateId),
    ).toEqual([USER_ID]);
  });

  it('answers with a 15-minute access token for the new user and key (SDD 7.1)', async () => {
    // When a device registers
    const result = await registerAndroid();

    // Then one token was minted for this user, key and trust level, for 900 seconds
    expect(fixture.tokens.issued).toEqual([
      {
        userId: USER_ID,
        keyIdentifier: device.androidKeyIdentifier,
        trustLevel: 'normal',
      },
    ]);
    expect(result.ok && result.value.expiresIn).toBe(900);
    expect(result.ok && result.value.accessToken).toBeTruthy();
  });

  it('mints no token for a rejected registration', async () => {
    // When registrations are rejected for a forged signature and for an unknown nonce
    await registerAndroid({ signer: new FakeDevice() });
    const unknown = 'A'.repeat(43);
    await fixture.registerDevice.execute({
      nonce: unknown,
      evidence: device.androidEvidence(unknown),
    });

    // Then no token was issued
    expect(fixture.tokens.issued).toEqual([]);
  });

  it('returns the existing user when the same key registers again (FR-AUTH-02)', async () => {
    // Given a registered device
    await registerAndroid();

    // When it registers again with a fresh challenge
    const again = await registerAndroid();

    // Then it is the same user, not created, and still only one UserRegistered
    expect(again).toMatchObject({
      ok: true,
      value: { userId: USER_ID, trustLevel: 'normal', created: false },
    });
    expect(fixture.identity.delivered).toHaveLength(1);
  });

  it('registers an iOS device the same way', async () => {
    // When an iOS device registers
    const nonce = await fixture.issueNonce();
    const result = await fixture.registerDevice.execute({
      nonce,
      evidence: device.iosEvidence(nonce),
    });

    // Then a user is created
    expect(result.ok && result.value.created).toBe(true);
  });

  it('opens a low-trust account when the platform check fails (TC-AUTH-04, FR-AUTH-06)', async () => {
    // When a device with a failed integrity verdict registers
    const result = await registerAndroid({ integrity: 'fail' });

    // Then the account exists with low trust
    expect(result).toMatchObject({
      ok: true,
      value: { userId: USER_ID, trustLevel: 'low', created: true },
    });
    // and its token says so too
    expect(fixture.tokens.issued[0]?.trustLevel).toBe('low');
  });

  it('keeps the trust level of an existing user when the key registers again with a failed check', async () => {
    // Given a normal-trust user
    await registerAndroid();

    // When the same key registers again and the platform check fails
    const again = await registerAndroid({ integrity: 'fail' });

    // Then the stored trust level is unchanged
    expect(again.ok && again.value.trustLevel).toBe('normal');
  });

  it('rejects a second registration with the same nonce (TC-AUTH-02, T-S4)', async () => {
    // Given a nonce that was used for a successful registration
    const nonce = await fixture.issueNonce();
    const evidence = device.androidEvidence(nonce);
    await fixture.registerDevice.execute({ nonce, evidence });

    // When it is used again
    const replay = await fixture.registerDevice.execute({ nonce, evidence });

    // Then it is rejected
    expect(errorOf(replay)).toEqual({ code: 'CHALLENGE_INVALID' });
  });

  it('rejects an expired nonce (TC-AUTH-03)', async () => {
    // Given a nonce whose 60 seconds have passed
    const nonce = await fixture.issueNonce();
    fixture.clock.advance(CHALLENGE_TTL_MS);

    // When it is used
    const result = await fixture.registerDevice.execute({
      nonce,
      evidence: device.androidEvidence(nonce),
    });

    // Then it is rejected and nothing is stored
    expect(errorOf(result)).toEqual({ code: 'CHALLENGE_INVALID' });
    expect(fixture.identity.delivered).toEqual([]);
  });

  it.each(['', 'not-a-nonce'])(
    'rejects the malformed nonce %j',
    async (nonce) => {
      // When a malformed nonce is used
      const result = await fixture.registerDevice.execute({
        nonce,
        evidence: device.androidEvidence(nonce),
      });

      // Then it is rejected like an unknown one
      expect(errorOf(result)).toEqual({ code: 'CHALLENGE_INVALID' });
    },
  );

  it('rejects an invalid signature, stores nothing and burns the nonce (T-S4)', async () => {
    // Given a device that cannot sign with the key it claims
    const nonce = await fixture.issueNonce();
    const forged = device.androidEvidence(nonce, { signer: new FakeDevice() });

    // When it registers
    const result = await fixture.registerDevice.execute({
      nonce,
      evidence: forged,
    });

    // Then it is rejected, no user exists, and the same nonce cannot be tried again
    expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    expect(fixture.identity.delivered).toEqual([]);
    const retry = await fixture.registerDevice.execute({
      nonce,
      evidence: device.androidEvidence(nonce),
    });
    expect(errorOf(retry)).toEqual({ code: 'CHALLENGE_INVALID' });
  });

  it('does not hand out an existing user to someone who only knows the public key', async () => {
    // Given a registered device
    await registerAndroid();

    // When an attacker presents that public key without being able to sign
    const result = await registerAndroid({ signer: new FakeDevice() });

    // Then it is rejected, not answered with the existing user
    expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
  });

  describe('a revoked key (FR-AUTH-07)', () => {
    const revokeKey = async () => {
      await fixture.identity.uow.run(async () => {
        const user = await fixture.identity.users.findById(USER_ID);
        if (user === undefined) throw new Error('user is not stored');
        user.revokeDeviceKey(
          device.androidKeyIdentifier as KeyIdentifier,
          new Date('2026-10-13T08:00:00.000Z'),
        );
        await fixture.identity.users.save(user);
      });
    };

    beforeEach(async () => {
      // Given a registered device whose key was then revoked
      await registerAndroid();
      await revokeKey();
    });

    it('is refused with KEY_REVOKED instead of handing out the existing user', async () => {
      // When the device registers again with a valid signature
      const result = await registerAndroid();

      // Then it is KEY_REVOKED, and no second user or UserRegistered appeared
      expect(errorOf(result)).toEqual({ code: 'KEY_REVOKED' });
      expect(fixture.identity.delivered).toHaveLength(1);
    });

    it('stays 401 for someone who cannot sign, so the revoked state is not revealed', async () => {
      // When a caller who only knows the public key registers
      const result = await registerAndroid({ signer: new FakeDevice() });

      // Then it is SIGNATURE_INVALID, not KEY_REVOKED
      expect(errorOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });
  });

  it('reports unreadable evidence as a validation error and stores nothing', async () => {
    // When the evidence cannot be read
    const nonce = await fixture.issueNonce();
    const result = await fixture.registerDevice.execute({
      nonce,
      evidence: { ...device.androidEvidence(nonce), integrityToken: '!!' },
    });

    // Then it is a format error
    expect(errorOf(result)).toEqual({
      code: 'VALIDATION_ERROR',
      field: 'integrityToken',
    });
    expect(fixture.identity.delivered).toEqual([]);
  });

  describe('two requests registering the same device at once (docs/07 §6)', () => {
    let lookupIsStale = false;

    /** Reads "not found" once when armed, as if the other request had not saved yet. */
    const staleWhenArmed = (inner: UserRepository): UserRepository => ({
      findById: (id) => inner.findById(id),
      findByKeyIdentifier: (key) => {
        const stale = lookupIsStale;
        lookupIsStale = false;
        return stale
          ? Promise.resolve(undefined)
          : inner.findByKeyIdentifier(key);
      },
      save: (user) => inner.save(user),
    });

    it('returns the user the other request created, after one retry, and publishes one UserRegistered', async () => {
      // Given a device that another request already registered, and a lookup that misses it
      fixture = await registrationFixture({ wrapUsers: staleWhenArmed });
      await registerAndroid();
      lookupIsStale = true;

      // When the same device registers again
      const result = await registerAndroid();

      // Then the key constraint made the first attempt conflict; the rerun returned the existing
      // user, nothing was duplicated, and the constraint was logged
      expect(result).toMatchObject({
        ok: true,
        value: { userId: USER_ID, trustLevel: 'normal', created: false },
      });
      expect(fixture.identity.delivered).toHaveLength(1);
      expect(
        fixture.identity.logger.warnings.map(
          (warning) => warning.fields['constraint'],
        ),
      ).toEqual(['device_keys_key_identifier_uq']);
    });
  });
});
