import { MemoryChallengeStore } from '../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import {
  MemoryUserRepository,
  type UserRow,
} from '../../src/contexts/identity/adapters/outbound/memory-user.repository.js';
import type { ChallengeStore } from '../../src/contexts/identity/application/ports/challenge-store.js';
import type { UserRepository } from '../../src/contexts/identity/application/ports/user-repository.js';
import type { UserRegistered } from '../../src/contexts/identity/public/user-registered.js';
import { InMemoryTable } from '../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../src/shared-kernel/outbox-record.js';
import type { UnitOfWork } from '../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from './fake-clock.js';
import { RecordingLogger } from './recording-logger.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

/** Everything an Identity repository test needs; the PostgreSQL harness (S0-11) has the same shape. */
export interface IdentityHarness {
  readonly uow: UnitOfWork;
  readonly users: UserRepository;
  /** UserRegistered events delivered by committed and rolled-back units of work alike. */
  readonly delivered: UserRegistered[];
  readonly logger: RecordingLogger;
  dispose(): Promise<void>;
}

/** The user repository on a fresh in-memory table; UserRegistered goes to a recording handler. */
export function memoryIdentityHarness(): Promise<IdentityHarness> {
  const users = new InMemoryTable<string, UserRow>();
  const delivered: UserRegistered[] = [];
  const logger = new RecordingLogger();
  const recordUserRegistered = {
    handle: (event: UserRegistered) => {
      delivered.push(event);
      return Promise.resolve();
    },
  };
  const uow = new InMemoryUnitOfWork({
    routes: fixedRoutes({ UserRegistered: { sync: [recordUserRegistered] } }),
    tables: [users],
    outbox: new InMemoryTable<string, OutboxRecord>(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });
  return Promise.resolve({
    uow,
    users: new MemoryUserRepository({ table: users, events: uow, logger }),
    delivered,
    logger,
    dispose: () => Promise.resolve(),
  });
}

/** What a ChallengeStore contract test needs; the Redis harness (S0-10, Should) has the same shape. */
export interface ChallengeStoreHarness {
  readonly store: ChallengeStore;
  readonly clock: FakeClock;
  dispose(): Promise<void>;
}

export function memoryChallengeStoreHarness(): Promise<ChallengeStoreHarness> {
  const clock = new FakeClock();
  return Promise.resolve({
    store: new MemoryChallengeStore({ clock }),
    clock,
    dispose: () => Promise.resolve(),
  });
}
