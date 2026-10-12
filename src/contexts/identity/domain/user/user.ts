import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type { Clock } from '../../../../shared-kernel/clock.js';
import type { IdGenerator } from '../../../../shared-kernel/id-generator.js';
import { UserId } from '../../../../shared-kernel/ids.js';
import type { UserRegistered } from '../events/user-registered.js';
import { copyDeviceKey, DeviceKeyId, type DeviceKey } from './device-key.js';
import type { KeyIdentifier } from './key-identifier.js';
import type { Platform } from './platform.js';
import type { PublicKey } from './public-key.js';
import {
  trustLevelFor,
  type AttestationResult,
  type TrustLevel,
} from './trust-level.js';

/** A device key as the attestation verifier reports it (slice 2: AttestationVerifier). */
export interface AttestedDeviceKey {
  readonly platform: Platform;
  readonly keyIdentifier: KeyIdentifier;
  readonly publicKey: PublicKey;
  readonly attestation: AttestationResult;
}

/** What registering needs besides the key: ids for the user and the key, and the time. */
export interface Registration {
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface UserState {
  readonly id: UserId;
  readonly trustLevel: TrustLevel;
  readonly createdAt: Date;
  readonly deviceKeys: readonly DeviceKey[];
}

/**
 * An anonymous end user and their device keys (docs/06 §5.1). There is no sign-up form: a user
 * exists from the first attested device key (FR-AUTH-01). That a key belongs to only one user
 * (FR-AUTH-02) spans users, so RegisterDevice looks the key up first and the repository keeps
 * key identifiers unique.
 */
export class User extends AggregateRoot<UserRegistered> {
  readonly #state: UserState;

  private constructor(state: UserState, version: number) {
    super(version);
    this.#state = {
      ...state,
      createdAt: new Date(state.createdAt),
      deviceKeys: state.deviceKeys.map(copyDeviceKey),
    };
  }

  /**
   * FR-AUTH-01: a new user with their first device key. The trust level follows only from the
   * attestation result (FR-AUTH-06). Records UserRegistered, so a wallet is opened in the same unit
   * of work (docs/06 §7).
   */
  static register(key: AttestedDeviceKey, registration: Registration): User {
    const now = registration.clock.now();
    const id = UserId.generate(registration.ids);
    const deviceKey: DeviceKey = {
      ...key,
      id: DeviceKeyId.generate(registration.ids),
      signCounter: 0,
      status: 'active',
      createdAt: now,
      revokedAt: null,
    };
    const user = new User(
      {
        id,
        trustLevel: trustLevelFor(key.attestation),
        createdAt: now,
        deviceKeys: [deviceKey],
      },
      0,
    );
    user.recordEvent({
      type: 'UserRegistered',
      aggregateId: id,
      occurredAt: new Date(now),
    });
    return user;
  }

  /** Restores a stored user; records no event. */
  static reconstitute(state: UserState, version: number): User {
    return new User(state, version);
  }

  get id(): UserId {
    return this.#state.id;
  }

  get trustLevel(): TrustLevel {
    return this.#state.trustLevel;
  }

  get createdAt(): Date {
    return new Date(this.#state.createdAt);
  }

  get deviceKeys(): readonly DeviceKey[] {
    return this.#state.deviceKeys.map(copyDeviceKey);
  }
}
