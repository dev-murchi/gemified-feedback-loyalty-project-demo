import type { UserId } from '../../../shared-kernel/ids.js';
import type { LevelPolicy } from '../../domain/level-policy.js';
import type { WalletRepository } from '../ports/wallet-repository.js';

export interface GetWalletDeps {
  readonly wallets: WalletRepository;
  readonly levels: LevelPolicy;
}

export interface GetWalletQuery {
  readonly userId: UserId;
}

/** The `Wallet` schema of the API contract (FR-AUTH-05). */
export interface WalletView {
  readonly xp: number;
  readonly points: number;
  readonly level: number;
  /** Total XP needed for the next level. */
  readonly xpForNextLevel: number;
  /** XP still missing for the next level. */
  readonly xpToNextLevel: number;
}

/** The user's balance and level; the level is derived from XP (FR-GAM-02). */
export class GetWallet {
  constructor(private readonly deps: GetWalletDeps) {}

  async execute(query: GetWalletQuery): Promise<WalletView> {
    const wallet = await this.deps.wallets.findById(query.userId);
    if (wallet === undefined)
      throw new Error(`User ${query.userId} has no wallet`);
    const level = this.deps.levels.levelFor(wallet.xp);
    const xpForNextLevel = this.deps.levels.xpToReach(level + 1);
    return {
      xp: wallet.xp,
      points: wallet.points,
      level,
      xpForNextLevel,
      xpToNextLevel: xpForNextLevel - wallet.xp,
    };
  }
}
