import { User } from '../../../src/contexts/identity/domain/user/user.js';
import { takeRecordedEvents } from '../../support/aggregate-access.js';
import {
  anAttestedKey,
  aUser,
  KEY_IDENTIFIER,
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
});
