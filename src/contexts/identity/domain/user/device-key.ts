import { typedId, type Branded } from '../../../../shared-kernel/ids.js';
import type { KeyIdentifier } from './key-identifier.js';
import type { Platform } from './platform.js';
import type { PublicKey } from './public-key.js';
import type { AttestationResult } from './trust-level.js';

export type DeviceKeyId = Branded<string, 'DeviceKeyId'>;
export const DeviceKeyId = typedId<DeviceKeyId>();

export type DeviceKeyStatus = 'active' | 'revoked';

/**
 * A key created in a device's secure hardware; an entity inside the User aggregate (docs/06 §5.1).
 * It is immutable: the user replaces it when it changes.
 */
export interface DeviceKey {
  readonly id: DeviceKeyId;
  readonly platform: Platform;
  readonly keyIdentifier: KeyIdentifier;
  readonly publicKey: PublicKey;
  readonly attestation: AttestationResult;
  /** iOS App Attest counter, 0 at registration; must strictly increase (session, slice 2). */
  readonly signCounter: number;
  readonly status: DeviceKeyStatus;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

/** Device keys hold Dates, which are mutable; copies keep callers from changing user state. */
export const copyDeviceKey = (key: DeviceKey): DeviceKey => ({
  ...key,
  createdAt: new Date(key.createdAt),
  revokedAt: key.revokedAt === null ? null : new Date(key.revokedAt),
});
