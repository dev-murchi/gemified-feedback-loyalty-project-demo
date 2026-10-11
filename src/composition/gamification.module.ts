import { Module } from '@nestjs/common';
import { MemoryWalletRepository } from '../gamification/adapters/outbound/memory-wallet.repository.js';
import type { WalletRepository } from '../gamification/application/ports/wallet-repository.js';
import { AwardReward } from '../gamification/application/use-cases/award-reward.js';
import { GetWallet } from '../gamification/application/use-cases/get-wallet.js';
import { LookupReward } from '../gamification/application/use-cases/lookup-reward.js';
import { OpenWallet } from '../gamification/application/use-cases/open-wallet.js';
import { LevelPolicy } from '../gamification/domain/level-policy.js';
import { DEFAULT_REWARD_AMOUNTS } from '../gamification/domain/reward-amounts.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
  AWARD_REWARD,
  GET_WALLET,
  IN_MEMORY_STORE,
  LOGGER,
  OPEN_WALLET,
  REWARD_LOOKUP,
  WALLET_REPOSITORY,
} from './tokens.js';

const levels = new LevelPolicy();

/**
 * Gamification wiring (in-memory until S0-11). Exports the two event handlers, which only
 * event-routes.ts registers, and the read side; the repository stays inside the module.
 */
@Module({
  providers: [
    {
      provide: WALLET_REPOSITORY,
      inject: [IN_MEMORY_STORE, LOGGER],
      useFactory: (store: InMemoryStore, logger: Logger) =>
        new MemoryWalletRepository({
          ...store.gamification,
          events: store.uow,
          logger,
        }),
    },
    {
      provide: OPEN_WALLET,
      inject: [WALLET_REPOSITORY],
      useFactory: (wallets: WalletRepository) => new OpenWallet({ wallets }),
    },
    {
      provide: AWARD_REWARD,
      inject: [WALLET_REPOSITORY, IN_MEMORY_STORE],
      useFactory: (wallets: WalletRepository, store: InMemoryStore) =>
        new AwardReward({
          wallets,
          rules: {
            amounts: DEFAULT_REWARD_AMOUNTS,
            ids: store.ids,
            clock: store.clock,
          },
        }),
    },
    {
      provide: GET_WALLET,
      inject: [WALLET_REPOSITORY],
      useFactory: (wallets: WalletRepository) =>
        new GetWallet({ wallets, levels }),
    },
    {
      provide: REWARD_LOOKUP,
      inject: [WALLET_REPOSITORY],
      useFactory: (wallets: WalletRepository) =>
        new LookupReward({ wallets, levels }),
    },
  ],
  exports: [OPEN_WALLET, AWARD_REWARD, GET_WALLET, REWARD_LOOKUP],
})
export class GamificationModule {}
