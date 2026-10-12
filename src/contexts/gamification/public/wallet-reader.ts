import type { UserId } from '../../../shared-kernel/ids.js';

/** The `Wallet` schema of docs/api/openapi.yaml: balance, level and the distance to the next one. */
export interface WalletView {
  readonly xp: number;
  readonly points: number;
  readonly level: number;
  /** Total XP needed for the next level. */
  readonly xpForNextLevel: number;
  /** XP still missing for the next level. */
  readonly xpToNextLevel: number;
}

/**
 * Open host service (docs/06 §5.5): a user's wallet as the API shows it (FR-AUTH-05). Every user
 * has a wallet from the moment they exist, so there is no "not found".
 */
export interface WalletReader {
  execute(query: { readonly userId: UserId }): Promise<WalletView>;
}
