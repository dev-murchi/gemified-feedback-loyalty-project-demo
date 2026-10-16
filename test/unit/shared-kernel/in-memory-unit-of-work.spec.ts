import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { retryOnConflict } from '../../../src/shared-kernel/retry-on-conflict.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';
import {
  fixedRoutes,
  type EventHandler,
  type EventRoutes,
} from '../../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import { FakeClock } from '../../support/fake-clock.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const clock = new FakeClock();

const event = (type: string, aggregateId = 'agg-1'): DomainEvent => ({
  type,
  aggregateId,
  occurredAt: clock.now(),
});

/** Builds a unit of work with a `users` table, a `wallets` table and an outbox. */
function setup(
  routes: (ctx: { wallets: InMemoryTable<string, string> }) => EventRoutes,
) {
  const users = new InMemoryTable<string, string>();
  const wallets = new InMemoryTable<string, string>();
  const outbox = new InMemoryTable<string, OutboxRecord>();
  const uow = new InMemoryUnitOfWork({
    routes: fixedRoutes(routes({ wallets })),
    tables: [users, wallets],
    outbox,
    clock,
    ids: new SequentialIdGenerator(),
  });
  return { uow, users, wallets, outbox };
}

const failingHandler: EventHandler = {
  handle: () => Promise.reject(new Error('handler failed')),
};

describe('InMemoryUnitOfWork', () => {
  it('commits changes and runs synchronous handlers in the same unit of work', async () => {
    // Given UserRegistered is handled synchronously by opening a wallet
    const { uow, users, wallets } = setup(({ wallets }) => ({
      UserRegistered: {
        sync: [
          {
            handle: (e) =>
              Promise.resolve(wallets.set(e.aggregateId, 'wallet')),
          },
        ],
      },
    }));

    // When a user is saved and UserRegistered is collected
    await uow.run(() => {
      users.set('user-1', 'user');
      uow.collect([event('UserRegistered', 'user-1')]);
      return Promise.resolve();
    });

    // Then both the user and the wallet exist
    expect(users.get('user-1')).toBe('user');
    expect(wallets.get('user-1')).toBe('wallet');
  });

  it('writes outbox-routed events to the outbox', async () => {
    // Given FeedbackSubmitted is routed to the outbox
    const { uow, outbox } = setup(() => ({
      FeedbackSubmitted: { outbox: true },
    }));
    const submitted = event('FeedbackSubmitted', 'feedback-1');

    // When the event is collected
    await uow.run(() => Promise.resolve(uow.collect([submitted])));

    // Then one outbox record holds it
    expect(outbox.values()).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        eventType: 'FeedbackSubmitted',
        aggregateId: 'feedback-1',
        payload: submitted,
        createdAt: clock.now(),
        attempts: 0,
        lastError: null,
        publishedAt: null,
      },
    ]);
  });

  it('rolls back every change, outbox included, when a synchronous handler fails', async () => {
    // Given one outbox-routed event and one event whose handler fails
    const { uow, users, outbox } = setup(() => ({
      FeedbackSubmitted: { outbox: true },
      FeedbackAnalyzed: { sync: [failingHandler] },
    }));
    users.set('user-0', 'existing');

    // When a unit of work saves data and collects both events
    const run = uow.run(() => {
      users.set('user-1', 'user');
      users.delete('user-0');
      uow.collect([event('FeedbackSubmitted'), event('FeedbackAnalyzed')]);
      return Promise.resolve();
    });

    // Then it fails and nothing it did remains
    await expect(run).rejects.toThrow('handler failed');
    expect(users.values()).toEqual(['existing']);
    expect(outbox.values()).toEqual([]);
  });

  it('rolls back when an event has no route', async () => {
    // Given no route for UnknownHappened
    const { uow, users } = setup(() => ({}));

    // When a unit of work collects it
    const run = uow.run(() => {
      users.set('user-1', 'user');
      uow.collect([event('UnknownHappened')]);
      return Promise.resolve();
    });

    // Then it fails and the change is undone
    await expect(run).rejects.toThrow();
    expect(users.values()).toEqual([]);
  });

  it('rolls back when the work itself throws', async () => {
    // Given a unit of work
    const { uow, users } = setup(() => ({}));

    // When the work saves data and then throws
    const run = uow.run(() => {
      users.set('user-1', 'user');
      return Promise.reject(new Error('work failed'));
    });

    // Then the change is undone
    await expect(run).rejects.toThrow('work failed');
    expect(users.values()).toEqual([]);
  });

  it('delivers events recorded by handlers in the same unit of work', async () => {
    // Given FeedbackAnalyzed's handler records FeedbackValidated, which is handled too
    const delivered: string[] = [];
    const { uow } = setup(() => ({
      FeedbackAnalyzed: {
        sync: [
          {
            handle: () =>
              Promise.resolve(uow.collect([event('FeedbackValidated')])),
          },
        ],
      },
      FeedbackValidated: {
        sync: [{ handle: (e) => Promise.resolve(void delivered.push(e.type)) }],
      },
    }));

    // When FeedbackAnalyzed is collected
    await uow.run(() =>
      Promise.resolve(uow.collect([event('FeedbackAnalyzed')])),
    );

    // Then FeedbackValidated was delivered as well
    expect(delivered).toEqual(['FeedbackValidated']);
  });

  it('runs units of work one at a time', async () => {
    // Given a first unit of work that is still in progress
    const { uow } = setup(() => ({}));
    const steps: string[] = [];
    let finishFirst = (): void => undefined;
    const first = uow.run(async () => {
      steps.push('first started');
      await new Promise<void>((resolve) => (finishFirst = resolve));
      steps.push('first finished');
    });

    await vi.waitFor(() => expect(steps).toEqual(['first started']));

    // When a second unit of work is started meanwhile
    const second = uow.run(() =>
      Promise.resolve(void steps.push('second started')),
    );
    await new Promise((resolve) => setImmediate(resolve));

    // Then it waits until the first has finished
    expect(steps).toEqual(['first started']);
    finishFirst();
    await Promise.all([first, second]);
    expect(steps).toEqual([
      'first started',
      'first finished',
      'second started',
    ]);
  });

  it('rolls back the whole unit of work when a synchronous handler conflicts, and a retry runs it again', async () => {
    // Given a UserRegistered handler that conflicts on its first call only
    let handlerCalls = 0;
    let workRuns = 0;
    const { uow, users, wallets } = setup(({ wallets }) => ({
      UserRegistered: {
        sync: [
          {
            handle: (e) => {
              handlerCalls += 1;
              wallets.set(e.aggregateId, `wallet-${handlerCalls}`);
              return handlerCalls === 1
                ? Promise.reject(new ConcurrencyConflictError('wallet-1'))
                : Promise.resolve();
            },
          },
        ],
      },
    }));
    const registerUser = () =>
      uow.run(() => {
        workRuns += 1;
        users.set('user-1', `user-${workRuns}`);
        uow.collect([event('UserRegistered', 'user-1')]);
        return Promise.resolve();
      });

    // When the unit of work runs with retryOnConflict
    await retryOnConflict(registerUser);

    // Then it ran twice and only the second run's changes remain
    expect(workRuns).toBe(2);
    expect(users.values()).toEqual(['user-2']);
    expect(wallets.values()).toEqual(['wallet-2']);
  });

  it('leaves nothing behind when a synchronous handler conflicts and nobody retries', async () => {
    // Given a UserRegistered handler that always conflicts
    const { uow, users, wallets } = setup(({ wallets }) => ({
      UserRegistered: {
        sync: [
          {
            handle: (e) => {
              wallets.set(e.aggregateId, 'wallet');
              return Promise.reject(new ConcurrencyConflictError('wallet-1'));
            },
          },
        ],
      },
    }));

    // When a unit of work saves a user and collects UserRegistered
    const run = uow.run(() => {
      users.set('user-1', 'user');
      uow.collect([event('UserRegistered', 'user-1')]);
      return Promise.resolve();
    });

    // Then the conflict reaches the caller and nothing was stored
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(users.values()).toEqual([]);
    expect(wallets.values()).toEqual([]);
  });

  it('refuses to collect events outside a unit of work', () => {
    // Given no unit of work is running
    const { uow } = setup(() => ({}));

    // When events are collected
    const collect = () => uow.collect([event('UserRegistered')]);

    // Then it is a programming error
    expect(collect).toThrow();
  });
});
