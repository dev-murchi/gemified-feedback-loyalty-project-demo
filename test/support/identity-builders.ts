// Small builders for Identity test data.

import type { KeyIdentifier } from '../../src/contexts/identity/domain/user/key-identifier.js';
import type { PublicKey } from '../../src/contexts/identity/domain/user/public-key.js';
import {
  User,
  type AttestedDeviceKey,
  type Registration,
} from '../../src/contexts/identity/domain/user/user.js';
import type { UserId } from '../../src/shared-kernel/ids.js';
import { FakeClock } from './fake-clock.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

export const REGISTERED_AT = new Date('2026-10-12T09:00:00.000Z');

/** The first id a fresh SequentialIdGenerator hands out; `aUser()` gets it. */
export const USER_ID = '00000000-0000-4000-8000-000000000001' as UserId;

/** SHA-256-sized identifiers: Android style (base64url, 43) and iOS style (base64, 44). */
export const KEY_IDENTIFIER =
  'Yz7kQ2mF9xR4tW1vB6nH3jL8pD5sA0gE2cU7iO4yT1q' as KeyIdentifier;
export const OTHER_KEY_IDENTIFIER =
  'bXlLZXlJZEZyb21BcHBBdHRlc3RTZXJ2aWNlMDAwMDA=' as KeyIdentifier;

export const PUBLIC_KEY = Buffer.from('stand-in for a P-256 DER SPKI').toString(
  'base64',
) as PublicKey;

export const anAttestedKey = (
  overrides: Partial<AttestedDeviceKey> = {},
): AttestedDeviceKey => ({
  platform: 'android',
  keyIdentifier: KEY_IDENTIFIER,
  publicKey: PUBLIC_KEY,
  attestation: 'passed',
  ...overrides,
});

/** Fresh ids every call, so every `aUser()` has the same identity (USER_ID). */
export const registration = (): Registration => ({
  ids: new SequentialIdGenerator(),
  clock: new FakeClock(REGISTERED_AT),
});

/** A newly registered, never-stored user (version 0) with one device key. */
export const aUser = (overrides: Partial<AttestedDeviceKey> = {}): User =>
  User.register(anAttestedKey(overrides), registration());

/** The id a SequentialIdGenerator hands out third; `anotherUser()` gets it. */
export const OTHER_USER_ID = '00000000-0000-4000-8000-000000000003' as UserId;

/** A never-stored user with a different identity (OTHER_USER_ID). */
export const anotherUser = (
  overrides: Partial<AttestedDeviceKey> = {},
): User => {
  const ids = new SequentialIdGenerator();
  ids.next();
  ids.next();
  return User.register(anAttestedKey(overrides), {
    ids,
    clock: new FakeClock(REGISTERED_AT),
  });
};
