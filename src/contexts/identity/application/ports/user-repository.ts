import type { UserId } from '../../../../shared-kernel/ids.js';
import type { KeyIdentifier } from '../../domain/user/key-identifier.js';
import type { User } from '../../domain/user/user.js';

export interface UserRepository {
  findById(id: UserId): Promise<User | undefined>;
  /** FR-AUTH-02: the user who owns the key, whether the key is active or revoked. */
  findByKeyIdentifier(keyIdentifier: KeyIdentifier): Promise<User | undefined>;
  /**
   * Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version.
   * Hands the user's events (UserRegistered) to the unit of work. Inside a unit of work. A key
   * identifier that already belongs to another user is a storage error and throws too (unique
   * DEVICE_KEYS.key_identifier, docs/07 §6).
   */
  save(user: User): Promise<void>;
}
