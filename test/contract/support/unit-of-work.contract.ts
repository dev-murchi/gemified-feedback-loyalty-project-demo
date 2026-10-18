// The UnitOfWork contract (ADR-014, ADR-020): the same cases run against the in-memory unit of work
// and PostgreSQL's (S0-11). Rows are opaque strings in two tables, `users` and `wallets`, written
// the way a repository writes: inside the current unit of work.

import type { Clock } from '../../../src/shared-kernel/clock.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';
import type {
  EventHandler,
  EventRoutes,
} from '../../../src/shared-kernel/event-routing.js';
import type { IdGenerator } from '../../../src/shared-kernel/id-generator.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import { retryOnConflict } from '../../../src/shared-kernel/retry-on-conflict.js';
import type {
  EventCollector,
  UnitOfWork,
} from '../../../src/shared-kernel/unit-of-work.js';
import { FakeClock } from '../../support/fake-clock.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

export type Table = 'users' | 'wallets';

/** Writes rows inside the current unit of work, as a repository does. */
export interface RowWriter {
  readonly put: (table: Table, key: string, value: string) => Promise<void>;
  readonly remove: (table: Table, key: string) => Promise<void>;
}

export interface RouteContext extends RowWriter {
  readonly collect: (events: readonly DomainEvent[]) => void;
}

export interface UnitOfWorkHarness extends RowWriter {
  readonly uow: UnitOfWork & EventCollector;
  /** Committed values of the table, sorted. */
  rows(table: Table): Promise<string[]>;
  /** Committed outbox records, oldest first. */
  outbox(): Promise<readonly OutboxRecord[]>;
}

export interface UnitOfWorkSetup {
  readonly routes: (context: RouteContext) => EventRoutes;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

// Aggregate ids are UUIDs, as the outbox stores them.
const USER_0 = '00000000-0000-4000-8000-0000000000a0';
const USER_1 = '00000000-0000-4000-8000-0000000000a1';
const FEEDBACK_1 = '00000000-0000-4000-8000-0000000000f1';

const failingHandler: EventHandler = {
  handle: () => Promise.reject(new Error('handler failed')),
};

export function unitOfWorkContract(
  makeHarness: (setup: UnitOfWorkSetup) => Promise<UnitOfWorkHarness>,
): void {
  const clock = new FakeClock();
  const event = (type: string, aggregateId = USER_1): DomainEvent => ({
    type,
    aggregateId,
    occurredAt: clock.now(),
  });
  const harnessWith = (routes: UnitOfWorkSetup['routes']) =>
    makeHarness({ routes, clock, ids: new SequentialIdGenerator() });

  it('commits changes and runs synchronous handlers in the same unit of work', async () => {
    // Given UserRegistered is handled synchronously by opening a wallet
    const h = await harnessWith(({ put }) => ({
      UserRegistered: {
        sync: [{ handle: (e) => put('wallets', e.aggregateId, 'wallet') }],
      },
    }));

    // When a user is saved and UserRegistered is collected
    const value = await h.uow.run(async () => {
      await h.put('users', USER_1, 'user');
      h.uow.collect([event('UserRegistered')]);
      return 'done';
    });

    // Then both the user and the wallet exist, and the work's value is returned
    expect(value).toBe('done');
    expect(await h.rows('users')).toEqual(['user']);
    expect(await h.rows('wallets')).toEqual(['wallet']);
  });

  it('writes outbox-routed events to the outbox', async () => {
    // Given FeedbackSubmitted is routed to the outbox
    const h = await harnessWith(() => ({
      FeedbackSubmitted: { outbox: true },
    }));

    // When the event is collected
    await h.uow.run(() =>
      Promise.resolve(h.uow.collect([event('FeedbackSubmitted', FEEDBACK_1)])),
    );

    // Then one unpublished outbox record holds it
    const records = await h.outbox();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      eventType: 'FeedbackSubmitted',
      aggregateId: FEEDBACK_1,
      payload: { type: 'FeedbackSubmitted', aggregateId: FEEDBACK_1 },
      createdAt: clock.now(),
      attempts: 0,
      lastError: null,
      publishedAt: null,
    });
  });

  it('rolls back every change, outbox included, when a synchronous handler fails', async () => {
    // Given one outbox-routed event, one event whose handler fails, and a stored user
    const h = await harnessWith(() => ({
      FeedbackSubmitted: { outbox: true },
      FeedbackAnalyzed: { sync: [failingHandler] },
    }));
    await h.uow.run(() => h.put('users', USER_0, 'existing'));

    // When a unit of work changes data and collects both events
    const run = h.uow.run(async () => {
      await h.put('users', USER_1, 'user');
      await h.remove('users', USER_0);
      h.uow.collect([
        event('FeedbackSubmitted', FEEDBACK_1),
        event('FeedbackAnalyzed', FEEDBACK_1),
      ]);
    });

    // Then it fails and nothing it did remains
    await expect(run).rejects.toThrow('handler failed');
    expect(await h.rows('users')).toEqual(['existing']);
    expect(await h.outbox()).toEqual([]);
  });

  it('rolls back when an event has no route', async () => {
    // Given no route for UnknownHappened
    const h = await harnessWith(() => ({}));

    // When a unit of work collects it
    const run = h.uow.run(async () => {
      await h.put('users', USER_1, 'user');
      h.uow.collect([event('UnknownHappened')]);
    });

    // Then it fails and the change is undone
    await expect(run).rejects.toThrow('No route');
    expect(await h.rows('users')).toEqual([]);
  });

  it('rolls back when the work itself throws', async () => {
    // Given a unit of work
    const h = await harnessWith(() => ({}));

    // When the work saves data and then throws
    const run = h.uow.run(async () => {
      await h.put('users', USER_1, 'user');
      throw new Error('work failed');
    });

    // Then the error reaches the caller unchanged and the change is undone
    await expect(run).rejects.toThrow('work failed');
    expect(await h.rows('users')).toEqual([]);
  });

  it('delivers events recorded by handlers in the same unit of work', async () => {
    // Given FeedbackAnalyzed's handler records FeedbackValidated, whose handler writes a row
    const h = await harnessWith(({ put, collect }) => ({
      FeedbackAnalyzed: {
        sync: [
          {
            handle: () =>
              Promise.resolve(
                collect([event('FeedbackValidated', FEEDBACK_1)]),
              ),
          },
        ],
      },
      FeedbackValidated: {
        sync: [{ handle: () => put('wallets', USER_1, 'rewarded') }],
      },
    }));

    // When FeedbackAnalyzed is collected
    await h.uow.run(() =>
      Promise.resolve(h.uow.collect([event('FeedbackAnalyzed', FEEDBACK_1)])),
    );

    // Then FeedbackValidated was delivered and committed with it
    expect(await h.rows('wallets')).toEqual(['rewarded']);
  });

  it('rolls back the whole unit of work when a synchronous handler conflicts, and a retry runs it again', async () => {
    // Given a UserRegistered handler that conflicts on its first call only
    let handlerCalls = 0;
    let workRuns = 0;
    const h = await harnessWith(({ put }) => ({
      UserRegistered: {
        sync: [
          {
            handle: async (e) => {
              handlerCalls += 1;
              await put('wallets', e.aggregateId, `wallet-${handlerCalls}`);
              if (handlerCalls === 1)
                throw new ConcurrencyConflictError(e.aggregateId);
            },
          },
        ],
      },
    }));
    const registerUser = () =>
      h.uow.run(async () => {
        workRuns += 1;
        await h.put('users', USER_1, `user-${workRuns}`);
        h.uow.collect([event('UserRegistered')]);
      });

    // When the unit of work runs with retryOnConflict
    await retryOnConflict(registerUser);

    // Then it ran twice and only the second run's changes remain
    expect(workRuns).toBe(2);
    expect(await h.rows('users')).toEqual(['user-2']);
    expect(await h.rows('wallets')).toEqual(['wallet-2']);
  });

  it('leaves nothing behind when a synchronous handler conflicts and nobody retries', async () => {
    // Given a UserRegistered handler that always conflicts
    const h = await harnessWith(({ put }) => ({
      UserRegistered: {
        sync: [
          {
            handle: async (e) => {
              await put('wallets', e.aggregateId, 'wallet');
              throw new ConcurrencyConflictError(e.aggregateId);
            },
          },
        ],
      },
    }));

    // When a unit of work saves a user and collects UserRegistered
    const run = h.uow.run(async () => {
      await h.put('users', USER_1, 'user');
      h.uow.collect([event('UserRegistered')]);
    });

    // Then the conflict reaches the caller and nothing was stored
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(await h.rows('users')).toEqual([]);
    expect(await h.rows('wallets')).toEqual([]);
  });

  it('refuses to collect events outside a unit of work', async () => {
    // Given no unit of work is running
    const h = await harnessWith(() => ({}));

    // When events are collected
    const collect = () => h.uow.collect([event('UserRegistered')]);

    // Then it is a programming error
    expect(collect).toThrow('outside UnitOfWork.run');
  });
}
