import type { B2bClient } from '../../domain/b2b-client/b2b-client.js';

export interface B2bClientRepository {
  findById(clientId: string): Promise<B2bClient | undefined>;
  /** Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version. Inside a unit of work. */
  save(client: B2bClient): Promise<void>;
}
