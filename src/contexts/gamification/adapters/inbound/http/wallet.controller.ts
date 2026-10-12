import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  BearerAuthGuard,
  CurrentPrincipal,
  type Principal,
} from '../../../../../platform/http/bearer-auth.guard.js';
import { UserId } from '../../../../../shared-kernel/ids.js';
import type {
  WalletReader,
  WalletView,
} from '../../../public/wallet-reader.js';
import { WALLET_READER } from './tokens.js';

/** `GET /v1/me/wallet` (FR-AUTH-05): the caller's balance, level and distance to the next level. */
@Controller('v1/me')
export class WalletController {
  constructor(@Inject(WALLET_READER) private readonly wallets: WalletReader) {}

  @Get('wallet')
  @UseGuards(BearerAuthGuard)
  wallet(@CurrentPrincipal() principal: Principal): Promise<WalletView> {
    const userId = UserId.create(principal.userId);
    // The principal comes from a verified token, whose `sub` was validated as a user id.
    if (!userId.ok)
      throw new Error('Authenticated principal has an invalid user id');
    return this.wallets.execute({ userId: userId.value });
  }
}
