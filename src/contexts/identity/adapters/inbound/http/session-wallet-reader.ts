import type { UserId } from '../../../../../shared-kernel/ids.js';

/** The `wallet` inside the `Session` response (docs/api/openapi.yaml). */
export interface WalletSummary {
  readonly xp: number;
  readonly points: number;
  readonly level: number;
  readonly xpForNextLevel: number;
  readonly xpToNextLevel: number;
}

/**
 * What the auth endpoints need from the wallet. Identity defines it and does not know who answers:
 * the composition root implements it with Gamification's wallet reader, so Identity depends on no
 * other context.
 */
export interface SessionWalletReader {
  walletOf(userId: UserId): Promise<WalletSummary>;
}
