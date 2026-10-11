import { typedId, type Branded } from '../../../shared-kernel/ids.js';
import type { QrToken } from './qr-token.js';

export type QrCodeId = Branded<string, 'QrCodeId'>;
export const QrCodeId = typedId<QrCodeId>();

export type QrCodeStatus = 'active' | 'revoked';

/**
 * A QR code printed for a branch; an entity inside the Branch aggregate (docs/06 §5.2). It is
 * immutable: the branch replaces it when its status changes.
 */
export interface QrCode {
  readonly id: QrCodeId;
  readonly token: QrToken;
  readonly status: QrCodeStatus;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}
