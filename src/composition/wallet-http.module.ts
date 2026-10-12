import { Module } from '@nestjs/common';
import { WalletController } from '../contexts/gamification/adapters/inbound/http/wallet.controller.js';
import { WALLET_READER } from '../contexts/gamification/adapters/inbound/http/tokens.js';
import { AuthenticationModule } from './authentication.module.js';
import { GamificationModule } from './gamification.module.js';
import { GET_WALLET } from './tokens.js';

/** `GET /v1/me/wallet`: Gamification's controller behind the bearer guard. */
@Module({
  imports: [GamificationModule, AuthenticationModule],
  controllers: [WalletController],
  providers: [{ provide: WALLET_READER, useExisting: GET_WALLET }],
})
export class WalletHttpModule {}
