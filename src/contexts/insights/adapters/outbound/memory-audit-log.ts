import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import type {
  AuditEntry,
  AuditLog,
} from '../../application/ports/audit-log.js';

/** Plain stored entry; mirrors B2B_AUDIT_LOG (SDD 6.1). */
export type AuditRow = AuditEntry;

/**
 * The in-memory audit log: append-only, an existing id is never overwritten. Writes happen outside
 * any unit of work: a read has nothing to roll back, and the entry must stay even if the response
 * then fails.
 */
export class MemoryAuditLog implements AuditLog {
  constructor(private readonly table: InMemoryTable<string, AuditRow>) {}

  record(entry: AuditEntry): Promise<void> {
    if (this.table.get(entry.id) !== undefined)
      return Promise.reject(
        new Error(`Audit entry ${entry.id} already exists`),
      );
    this.table.set(entry.id, entry);
    return Promise.resolve();
  }
}
