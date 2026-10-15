import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../../shared-kernel/adapters/save-versioned.js';
import type { EventCollector } from '../../../../shared-kernel/unit-of-work.js';
import type { B2bClientRepository } from '../../application/ports/b2b-client-repository.js';
import {
  B2bClient,
  type B2bClientState,
} from '../../domain/b2b-client/b2b-client.js';

/** Plain stored client; mirrors B2B_CLIENTS (SDD 6.1). */
export interface B2bClientRow extends B2bClientState {
  readonly version: number;
}

export interface MemoryB2bClientRepositoryDeps {
  readonly table: InMemoryTable<string, B2bClientRow>;
  readonly events: EventCollector;
}

export class MemoryB2bClientRepository implements B2bClientRepository {
  constructor(private readonly deps: MemoryB2bClientRepositoryDeps) {}

  findById(clientId: string): Promise<B2bClient | undefined> {
    const row = this.deps.table.get(clientId);
    if (row === undefined) return Promise.resolve(undefined);
    const { version, ...state } = row;
    return Promise.resolve(B2bClient.reconstitute(state, version));
  }

  save(client: B2bClient): Promise<void> {
    return saveVersioned(this.deps, client, {
      key: client.clientId,
      toRow: (version) => ({ ...client.state, version }),
    });
  }
}
