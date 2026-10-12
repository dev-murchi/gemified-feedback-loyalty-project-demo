import { User } from '../../../src/contexts/identity/domain/user/user.js';
import { takeRecordedEvents } from '../../support/aggregate-access.js';
import {
  anAttestedKey,
  aUser,
  KEY_IDENTIFIER,
  OTHER_KEY_IDENTIFIER,
  PUBLIC_KEY,
  REGISTERED_AT,
  USER_ID,
} from '../../support/identity-builders.js';

describe('User', () => {
  it('registers a new user with one active device key (FR-AUTH-01)', () => {
    // Given an attested device key
    // When a user registers with it
    const user = aUser({ platform: 'ios' });

    // Then the user is new and holds exactly that key, active and with counter 0
    expect(user.id).toBe(USER_ID);
    expect(user.version).toBe(0);
    expect(user.createdAt).toEqual(REGISTERED_AT);
    expect(user.deviceKeys).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000002',
        platform: 'ios',
        keyIdentifier: KEY_IDENTIFIER,
        publicKey: PUBLIC_KEY,
        attestation: 'passed',
        signCounter: 0,
        status: 'active',
        createdAt: REGISTERED_AT,
        revokedAt: null,
      },
    ]);
  });

  it.each([
    ['passed', 'normal'],
    ['failed', 'low'],
  ] as const)(
    'gets trust level %s → %s from the attestation alone (FR-AUTH-06, TC-AUTH-04)',
    (attestation, trustLevel) => {
      // Given a key whose attestation had this result
      // When a user registers with it
      const user = aUser({ attestation });

      // Then the trust level follows from it
      expect(user.trustLevel).toBe(trustLevel);
    },
  );

  it('records UserRegistered once, so a wallet is opened with the user', () => {
    // Given a newly registered user
    const user = aUser();

    // When its events are taken twice
    const first = takeRecordedEvents(user);
    const second = takeRecordedEvents(user);

    // Then there was exactly one UserRegistered for this user, at registration time
    expect(first).toEqual([
      {
        type: 'UserRegistered',
        aggregateId: USER_ID,
        occurredAt: REGISTERED_AT,
      },
    ]);
    expect(second).toEqual([]);
  });

  it('records no event when restored from storage', () => {
    // Given the state of a stored user
    const stored = aUser();
    const state = {
      id: stored.id,
      trustLevel: stored.trustLevel,
      createdAt: stored.createdAt,
      deviceKeys: stored.deviceKeys,
    };

    // When it is reconstituted
    const user = User.reconstitute(state, 3);

    // Then it has the stored version and no events
    expect(user.version).toBe(3);
    expect(takeRecordedEvents(user)).toEqual([]);
  });

  it('cannot be changed through the values it returns', () => {
    // Given a user
    const user = User.register(anAttestedKey(), {
      ids: { next: () => '00000000-0000-4000-8000-0000000000aa' },
      clock: { now: () => new Date(REGISTERED_AT) },
    });

    // When a caller changes the dates it got back
    user.createdAt.setFullYear(2000);
    user.deviceKeys[0]?.createdAt.setFullYear(2000);

    // Then the user is unchanged
    expect(user.createdAt).toEqual(REGISTERED_AT);
    expect(user.deviceKeys[0]?.createdAt).toEqual(REGISTERED_AT);
  });

  describe('revoking a device key (FR-AUTH-07)', () => {
    const REVOKED_AT = new Date('2026-10-13T08:00:00.000Z');

    it('marks the key revoked and remembers when, leaving the user and its events alone', () => {
      // Given a registered user whose registration event was taken
      const user = aUser();
      takeRecordedEvents(user);

      // When its key is revoked
      const outcome = user.revokeDeviceKey(KEY_IDENTIFIER, REVOKED_AT);

      // Then the key is revoked at that time, and no event was recorded
      expect(outcome).toEqual({ ok: true, value: 'revoked' });
      expect(user.deviceKeys[0]).toMatchObject({
        status: 'revoked',
        revokedAt: REVOKED_AT,
      });
      expect(takeRecordedEvents(user)).toEqual([]);
    });

    it('does nothing when the key is already revoked, so the first revocation time stays', () => {
      // Given a revoked key
      const user = aUser();
      user.revokeDeviceKey(KEY_IDENTIFIER, REVOKED_AT);

      // When it is revoked again later
      const outcome = user.revokeDeviceKey(
        KEY_IDENTIFIER,
        new Date('2026-10-14T08:00:00.000Z'),
      );

      // Then it says so and keeps the first time
      expect(outcome).toEqual({ ok: true, value: 'already_revoked' });
      expect(user.deviceKeys[0]?.revokedAt).toEqual(REVOKED_AT);
    });

    it('reports a key the user does not have', () => {
      // Given a user and the identifier of another device's key
      const user = aUser();

      // When that key is revoked
      const outcome = user.revokeDeviceKey(OTHER_KEY_IDENTIFIER, REVOKED_AT);

      // Then it is NOT_FOUND and the user's own key is untouched
      expect(outcome).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
      expect(user.deviceKeys[0]?.status).toBe('active');
    });

    it('lets an active key be used and refuses a revoked one with KEY_REVOKED', () => {
      // Given a user with an active key
      const user = aUser();

      // When the key is checked before and after revocation
      const before = user.checkKeyUsable(KEY_IDENTIFIER);
      user.revokeDeviceKey(KEY_IDENTIFIER, REVOKED_AT);
      const after = user.checkKeyUsable(KEY_IDENTIFIER);

      // Then it is usable first, and KEY_REVOKED afterwards
      expect(before.ok && before.value.keyIdentifier).toBe(KEY_IDENTIFIER);
      expect(after).toEqual({ ok: false, error: { code: 'KEY_REVOKED' } });
    });

    it('treats checking a key the user does not have as a programming error', () => {
      // Given a user
      const user = aUser();

      // When a key of another device is checked
      // Then it throws: callers find the user by the key
      expect(() => user.checkKeyUsable(OTHER_KEY_IDENTIFIER)).toThrow();
    });
  });
});
