// What only the in-memory unit of work does. The behaviour every unit of work shares (commit,
// rollback, outbox, event delivery, conflicts) is the UnitOfWork contract in
// test/contract/support/unit-of-work.contract.ts.

import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import { FakeClock } from '../../support/fake-clock.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

describe('InMemoryUnitOfWork', () => {
  it('runs units of work one at a time', async () => {
    // Given a first unit of work that is still in progress
    const uow = new InMemoryUnitOfWork({
      routes: fixedRoutes({}),
      tables: [],
      outbox: new InMemoryTable<string, OutboxRecord>(),
      clock: new FakeClock(),
      ids: new SequentialIdGenerator(),
    });
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
});
