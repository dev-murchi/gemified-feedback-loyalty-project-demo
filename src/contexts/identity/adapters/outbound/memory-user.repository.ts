import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../../shared-kernel/adapters/save-versioned.js';
import type { UserId } from '../../../../shared-kernel/ids.js';
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

  save(user: User): Promise<void> {
    if (this.#keyTakenByAnotherUser(user)) {
      return Promise.reject(
        new Error('A device key of this user already belongs to another user'),
      );
    }
    return saveVersioned(this.deps, user, {
      key: user.id,
      toRow: (version) => toRow(user, version),
    });
  }

  /** Emulates the unique constraint on DEVICE_KEYS.key_identifier (FR-AUTH-02). */
  #keyTakenByAnotherUser(user: User): boolean {
    const keys = new Set<string>(
      user.deviceKeys.map((key) => key.keyIdentifier),
    );
    return this.deps.table
      .values()
      .some(
        (row) =>
          row.id !== user.id &&
          row.deviceKeys.some((key) => keys.has(key.keyIdentifier)),
      );
  }
}
