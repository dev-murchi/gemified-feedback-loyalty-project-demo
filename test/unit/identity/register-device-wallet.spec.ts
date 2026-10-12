import {
  MemoryWalletRepository,
  type LedgerRow,
  type WalletRow,
} from '../../../src/contexts/gamification/adapters/outbound/memory-wallet.repository.js';
import { OpenWallet } from '../../../src/contexts/gamification/application/use-cases/open-wallet.js';
import { Wallet } from '../../../src/contexts/gamification/domain/wallet/wallet.js';
import {
  MemoryUserRepository,
  type UserRow,
} from '../../../src/contexts/identity/adapters/outbound/memory-user.repository.js';
import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { EventRouter } from '../../../src/shared-kernel/adapters/event-router.js';
import { InMemoryUnitOfWork } from '../../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import { FakeClock } from '../../support/fake-clock.js';
import { FakeDevice } from '../../support/fake-device.js';
import { USER_ID } from '../../support/identity-builders.js';
import { registrationFixture } from '../../support/registration-fixture.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

/**
 * Identity and Gamification on one in-memory unit of work, wired the way the composition root does:
 * UserRegistered → OpenWallet (docs/06 §7, docs/08 S0-05 done criterion).
 */
async function registrationWithWallets() {
  const logger = new RecordingLogger();
  const users = new InMemoryTable<string, UserRow>();
  const wallets = new InMemoryTable<string, WalletRow>();
  const ledger = new InMemoryTable<string, LedgerRow>();
  const router = new EventRouter();
  const uow = new InMemoryUnitOfWork({
    routes: router,
    tables: [users, wallets, ledger],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  const walletRepository = new MemoryWalletRepository({
    wallets,
    ledger,
    events: uow,
    logger,
  });
  router.register('UserRegistered', {
    sync: [new OpenWallet({ wallets: walletRepository })],
  });
  router.freeze();
  const userRepository = new MemoryUserRepository({
    table: users,
    events: uow,
    logger,
  });
  const fixture = await registrationFixture({
    identity: { uow, users: userRepository },
  });
  return { fixture, wallets: walletRepository, users: userRepository, uow };
}

describe('RegisterDevice with Gamification', () => {
  it('creates the user and an empty wallet in the same transaction (FR-AUTH-01, FR-AUTH-04)', async () => {
    // Given a registered device
    const { fixture, wallets } = await registrationWithWallets();
    const device = new FakeDevice();
    const nonce = await fixture.issueNonce();

    // When it registers
    const result = await fixture.registerDevice.execute({
      nonce,
      evidence: device.androidEvidence(nonce),
    });

    // Then the user has a wallet with 0 XP and 0 points
    expect(result.ok && result.value.userId).toBe(USER_ID);
    const wallet = await wallets.findById(USER_ID);
    expect([wallet?.xp, wallet?.points]).toEqual([0, 0]);
  });

  it('stores neither user nor wallet when the wallet cannot be opened', async () => {
    // Given a wallet that already exists for the id the new user would get
    const { fixture, wallets, users, uow } = await registrationWithWallets();
    await uow.run(() => wallets.save(Wallet.open(USER_ID)));
    const device = new FakeDevice();
    const nonce = await fixture.issueNonce();

    // When the device registers
    const run = fixture.registerDevice.execute({
      nonce,
      evidence: device.androidEvidence(nonce),
    });

    // Then OpenWallet refuses, the whole registration fails and no user was stored; the wallet
    // that was already there is untouched
    await expect(run).rejects.toThrow(/already has a wallet/);
    expect(await users.findById(USER_ID)).toBeUndefined();
    expect((await wallets.findById(USER_ID))?.version).toBe(1);
  });

  it('registers the same device again without opening a second wallet', async () => {
    // Given a registered device
    const { fixture, wallets } = await registrationWithWallets();
    const device = new FakeDevice();
    const first = await fixture.issueNonce();
    await fixture.registerDevice.execute({
      nonce: first,
      evidence: device.androidEvidence(first),
    });

    // When it registers again
    const second = await fixture.issueNonce();
    const again = await fixture.registerDevice.execute({
      nonce: second,
      evidence: device.androidEvidence(second),
    });

    // Then it is the existing user and the wallet is still version 1
    expect(again.ok && again.value.created).toBe(false);
    expect((await wallets.findById(USER_ID))?.version).toBe(1);
  });
});
