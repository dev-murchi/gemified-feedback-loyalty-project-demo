// The optimistic-locking part of every repository contract (ADR-019, docs/07 §4–5). Each context's
// repository contract calls this; the same cases run against in-memory and PostgreSQL adapters.

import type { AggregateRoot } from '../../../src/shared-kernel/aggregate-root.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import type { UnitOfWork } from '../../../src/shared-kernel/unit-of-work.js';

export interface VersionedRepositoryHarness<A extends AggregateRoot> {
  readonly uow: UnitOfWork;
  /** A never-stored aggregate (version 0); every call returns one with the same identity. */
  newAggregate(): A;
  save(aggregate: A): Promise<void>;
  /** Loads the aggregate with that identity. */
  load(): Promise<A | undefined>;
  dispose(): Promise<void>;
}

export function versionedRepositoryContract<A extends AggregateRoot>(
  makeHarness: () => Promise<VersionedRepositoryHarness<A>>,
): void {
  let harness: VersionedRepositoryHarness<A>;
  const save = (aggregate: A) => harness.uow.run(() => harness.save(aggregate));
  const loadStored = async (): Promise<A> => {
    const loaded = await harness.load();
    if (loaded === undefined) throw new Error('aggregate is not stored');
    return loaded;
  };

  beforeEach(async () => {
    harness = await makeHarness();
  });

  afterEach(() => harness.dispose());

  it('inserts a never-stored aggregate (version 0) into an empty store', async () => {
    // Given a new aggregate
    const aggregate = harness.newAggregate();

    // When it is saved
    await save(aggregate);

    // Then it is stored at version 1, and the instance knows it
    expect(aggregate.version).toBe(1);
    expect((await harness.load())?.version).toBe(1);
  });

  it('saves the same instance twice without a false conflict', async () => {
    // Given an aggregate that was saved once
    const aggregate = harness.newAggregate();
    await save(aggregate);

    // When the same instance is saved again
    await save(aggregate);

    // Then the version moved on
    expect((await harness.load())?.version).toBe(2);
  });

  it('rejects a stale instance with a concurrency conflict', async () => {
    // Given two instances loaded from the same stored version
    await save(harness.newAggregate());
    const first = await loadStored();
    const second = await loadStored();

    // When both are saved
    await save(first);
    const run = save(second);

    // Then the second save conflicts and the stored version is the first one's
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect((await harness.load())?.version).toBe(2);
  });

  it('rejects a never-stored aggregate whose identity is already stored', async () => {
    // Given a stored aggregate
    await save(harness.newAggregate());

    // When another never-stored aggregate with the same identity is saved
    const run = save(harness.newAggregate());

    // Then it conflicts instead of overwriting
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect((await harness.load())?.version).toBe(1);
  });

  it('undoes the first save of a unit of work when a later save conflicts', async () => {
    // Given a stored aggregate (version 2) and a stale copy of it (version 1)
    await save(harness.newAggregate());
    const stale = await loadStored();
    await save(await loadStored());

    // When one unit of work first saves a fresh copy, then the stale one
    const run = harness.uow.run(async () => {
      await harness.save(await loadStored());
      await harness.save(stale);
    });

    // Then it fails with a conflict and the first save is undone
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect((await harness.load())?.version).toBe(2);
  });

  it('keeps nothing when the unit of work rolls back', async () => {
    // Given a save inside a unit of work that then fails
    const run = harness.uow.run(async () => {
      await harness.save(harness.newAggregate());
      throw new Error('fails after saving');
    });

    // When the unit of work rolls back
    await expect(run).rejects.toThrow('fails after saving');

    // Then nothing was stored
    expect(await harness.load()).toBeUndefined();
  });
}
