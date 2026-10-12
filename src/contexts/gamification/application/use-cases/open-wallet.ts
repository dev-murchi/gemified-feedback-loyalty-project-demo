import type { UserRegistered } from '../../../identity/public/user-registered.js';
import type { EventHandler } from '../../../../shared-kernel/event-routing.js';
import { Wallet } from '../../domain/wallet/wallet.js';
import type { WalletRepository } from '../ports/wallet-repository.js';

export interface OpenWalletDeps {
  readonly wallets: WalletRepository;
}

/**
 * Handles UserRegistered: every user has a wallet from the moment they exist (FR-AUTH-01,
 * FR-AUTH-04). Runs inside the publisher's unit of work and never retries itself.
 *
 * Deliberately not idempotent: a retry reruns the publisher's unit of work from rolled-back state,
 * so a legitimate second UserRegistered for the same user cannot happen. A wallet that already
 * exists therefore means a bug (e.g. a reused user id that would get someone else's wallet); it
 * throws, and the whole unit of work, the registration included, rolls back.
 */
export class OpenWallet implements EventHandler<UserRegistered> {
  constructor(private readonly deps: OpenWalletDeps) {}

  async handle(event: UserRegistered): Promise<void> {
    const existing = await this.deps.wallets.findById(event.aggregateId);
    if (existing !== undefined) {
      throw new Error(
        `User ${event.aggregateId} already has a wallet; UserRegistered must be published once per user`,
      );
    }
    await this.deps.wallets.save(Wallet.open(event.aggregateId));
  }
}
