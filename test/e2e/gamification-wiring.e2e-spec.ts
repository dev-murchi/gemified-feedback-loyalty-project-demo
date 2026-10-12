// S0-06 done criterion, through the wired composition: the real AppModule and its event routes.

import { Test, type TestingModule } from '@nestjs/testing';
import type { BrandRepository } from '../../src/contexts/catalog/application/ports/brand-repository.js';
import type { FeedbackValidated } from '../../src/contexts/feedback/public/feedback-validated.js';
import type { WalletRepository } from '../../src/contexts/gamification/application/ports/wallet-repository.js';
import type { GetWallet } from '../../src/contexts/gamification/application/use-cases/get-wallet.js';
import type { RewardLookup } from '../../src/contexts/gamification/public/reward-lookup.js';
import type { UserRegistered } from '../../src/contexts/identity/public/user-registered.js';
import { AppModule } from '../../src/composition/app.module.js';
import type { InMemoryStore } from '../../src/composition/in-memory-store.js';
import {
  CATALOG_REPOSITORIES,
  EVENT_ROUTER,
  GET_WALLET,
  IN_MEMORY_STORE,
  REWARD_LOOKUP,
  WALLET_REPOSITORY,
} from '../../src/composition/tokens.js';
import type { EventRouter } from '../../src/shared-kernel/adapters/event-router.js';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';
import type { FeedbackId, UserId } from '../../src/shared-kernel/ids.js';
import { aBrand, BRAND_ID } from '../support/catalog-builders.js';

const USER_ID = 'a0000000-0000-4000-8000-000000000001' as UserId;
const FEEDBACK_ID = 'f0000000-0000-4000-8000-000000000001' as FeedbackId;
const NOW = new Date('2026-10-12T09:00:00.000Z');

const userRegistered: UserRegistered = {
  type: 'UserRegistered',
  aggregateId: USER_ID,
  occurredAt: NOW,
};
const feedbackValidated: FeedbackValidated = {
  type: 'FeedbackValidated',
  aggregateId: FEEDBACK_ID,
  userId: USER_ID,
  submittedAt: NOW,
  rewardEligible: true,
  occurredAt: NOW,
};

/** A wallet repository that cannot save: OpenWallet fails inside the unit of work. */
const brokenWallets: WalletRepository = {
  findById: () => Promise.resolve(undefined),
  findWithLedgerKey: () => Promise.resolve(undefined),
  findLedgerEntry: () => Promise.resolve(undefined),
  save: () => Promise.reject(new Error('wallet store unavailable')),
};

const publishIn = (
  app: TestingModule,
  events: readonly DomainEvent[],
  before?: () => Promise<void>,
) => {
  const store = app.get<InMemoryStore>(IN_MEMORY_STORE);
  return store.uow.run(async () => {
    await before?.();
    store.uow.collect(events);
  });
};

describe('Gamification wiring (e2e)', () => {
  let app: TestingModule;

  afterEach(async () => {
    await app.close();
  });

  it('freezes the event routes during start-up', async () => {
    // Given the application started
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // When a route is registered afterwards
    const router = app.get<EventRouter>(EVENT_ROUTER);
    const late = () => router.register('UserRegistered', { outbox: true });

    // Then the router is frozen and refuses it
    expect(router.frozen).toBe(true);
    expect(late).toThrow();
  });

  it('opens the wallet in the same unit of work when UserRegistered is published', async () => {
    // Given the application started
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // When a unit of work publishes UserRegistered
    await publishIn(app, [userRegistered]);

    // Then the user's wallet exists, empty, at level 1
    const wallet = await app
      .get<GetWallet>(GET_WALLET)
      .execute({ userId: USER_ID });
    expect(wallet).toEqual({
      xp: 0,
      points: 0,
      level: 1,
      xpForNextLevel: 100,
      xpToNextLevel: 100,
    });
  });

  it('rolls everything back, other contexts included, when OpenWallet fails', async () => {
    // Given the application started with a wallet store that cannot save
    app = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WALLET_REPOSITORY)
      .useValue(brokenWallets)
      .compile();
    const brands = app.get<{ brands: BrandRepository }>(
      CATALOG_REPOSITORIES,
    ).brands;

    // When one unit of work saves a brand and publishes UserRegistered
    const run = publishIn(app, [userRegistered], () => brands.save(aBrand()));

    // Then it fails and the brand saved in the same unit of work is gone too
    await expect(run).rejects.toThrow('wallet store unavailable');
    expect(await brands.findById(BRAND_ID)).toBeUndefined();
  });

  it('awards through the wired FeedbackValidated route', async () => {
    // Given the application started and the user has a wallet
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await publishIn(app, [userRegistered]);

    // When FeedbackValidated is published
    await publishIn(app, [feedbackValidated]);

    // Then the reward can be looked up
    const reward = await app
      .get<RewardLookup>(REWARD_LOOKUP)
      .rewardFor(USER_ID, FEEDBACK_ID);
    expect(reward).toEqual({ xp: 10, points: 5, levelUp: null });
  });
});
