import type { UserId } from '../../../shared-kernel/ids.js';
import type { TrustLevel } from '../domain/user/trust-level.js';

/** What registering or opening a session gives back (the `Session` schema, minus the wallet). */
export interface SessionGrant {
  readonly userId: UserId;
  readonly trustLevel: TrustLevel;
  readonly accessToken: string;
  readonly expiresIn: number;
}
