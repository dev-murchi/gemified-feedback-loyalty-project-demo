import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import {
  asPromise,
  checkVersion,
  commitVersioned,
} from '../../../../shared-kernel/adapters/save-versioned.js';
import { ConcurrencyConflictError } from '../../../../shared-kernel/concurrency-conflict-error.js';
import type { UserId } from '../../../../shared-kernel/ids.js';
import type { Logger } from '../../../../shared-kernel/logger.js';
import type { EventCollector } from '../../../../shared-kernel/unit-of-work.js';
import type { UserRepository } from '../../application/ports/user-repository.js';
import type {
  DeviceKey,
  DeviceKeyId,
  DeviceKeyStatus,
} from '../../domain/user/device-key.js';
import type { KeyIdentifier } from '../../domain/user/key-identifier.js';
import type { Platform } from '../../domain/user/platform.js';
import type { PublicKey } from '../../domain/user/public-key.js';
import type {
  AttestationResult,
  TrustLevel,
} from '../../domain/user/trust-level.js';
import { User } from '../../domain/user/user.js';

/** Plain stored device key; mirrors DEVICE_KEYS (SDD 6.1). */
export interface DeviceKeyRow {
  readonly id: string;
  readonly platform: Platform;
  readonly keyIdentifier: string;
  readonly publicKey: string;
  readonly attestationResult: AttestationResult;
  readonly signCounter: number;
  readonly status: DeviceKeyStatus;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

/** Plain stored user with their device keys; mirrors USERS + DEVICE_KEYS (SDD 6.1). */
export interface UserRow {
  readonly id: string;
  readonly trustLevel: TrustLevel;
  readonly createdAt: Date;
  readonly deviceKeys: readonly DeviceKeyRow[];
  readonly version: number;
}

export interface MemoryUserRepositoryDeps {
  readonly table: InMemoryTable<string, UserRow>;
  readonly events: EventCollector;
  readonly logger: Logger;
}

const toDeviceKey = (row: DeviceKeyRow): DeviceKey => ({
  id: row.id as DeviceKeyId,
  platform: row.platform,
  keyIdentifier: row.keyIdentifier as KeyIdentifier,
  publicKey: row.publicKey as PublicKey,
  attestation: row.attestationResult,
  signCounter: row.signCounter,
  status: row.status,
  createdAt: row.createdAt,
  revokedAt: row.revokedAt,
});

const toDeviceKeyRow = (key: DeviceKey): DeviceKeyRow => ({
  id: key.id,
  platform: key.platform,
  keyIdentifier: key.keyIdentifier,
  publicKey: key.publicKey,
  attestationResult: key.attestation,
  signCounter: key.signCounter,
  status: key.status,
  createdAt: key.createdAt,
  revokedAt: key.revokedAt,
});

const toUser = (row: UserRow): User =>
  User.reconstitute(
    {
      id: row.id as UserId,
      trustLevel: row.trustLevel,
      createdAt: row.createdAt,
      deviceKeys: row.deviceKeys.map(toDeviceKey),
    },
    row.version,
  );

const toRow = (user: User, version: number): UserRow => ({
  id: user.id,
  trustLevel: user.trustLevel,
  createdAt: user.createdAt,
  deviceKeys: user.deviceKeys.map(toDeviceKeyRow),
  version,
});

export class MemoryUserRepository implements UserRepository {
  constructor(private readonly deps: MemoryUserRepositoryDeps) {}

  findById(id: UserId): Promise<User | undefined> {
    const row = this.deps.table.get(id);
    return Promise.resolve(row === undefined ? undefined : toUser(row));
  }

  findByKeyIdentifier(keyIdentifier: KeyIdentifier): Promise<User | undefined> {
    const row = this.deps.table
      .values()
      .find((candidate) =>
        candidate.deviceKeys.some((key) => key.keyIdentifier === keyIdentifier),
      );
    return Promise.resolve(row === undefined ? undefined : toUser(row));
  }

  /** User version first, then the key constraint, then all writes (docs/07 §6). */
  save(user: User): Promise<void> {
    return asPromise(() => {
      const storedVersion = checkVersion(this.deps.table, user.id, user);
      this.#assertKeysFree(user);
      commitVersioned(this.deps, user, {
        key: user.id,
        toRow: (version) => toRow(user, version),
        storedVersion,
      });
    });
  }

  /**
   * Emulates the unique constraint `device_keys_key_identifier_uq` (FR-AUTH-02). A taken key means
   * the same device registered concurrently: a concurrency symptom, logged and retried by the
   * caller, whose rerun finds the existing user.
   */
  #assertKeysFree(user: User): void {
    const keys = new Set<string>(
      user.deviceKeys.map((key) => key.keyIdentifier),
    );
    const taken = this.deps.table
      .values()
      .filter((row) => row.id !== user.id)
      .flatMap((row) => row.deviceKeys)
      .find((key) => keys.has(key.keyIdentifier));
    if (taken === undefined) return;
    this.deps.logger.warn(
      'Device key already belongs to another user; retrying the unit of work',
      {
        constraint: 'device_keys_key_identifier_uq',
        key: taken.keyIdentifier,
      },
    );
    throw new ConcurrencyConflictError(taken.keyIdentifier);
  }
}
