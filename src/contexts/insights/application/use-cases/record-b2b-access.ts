import type { Clock } from '../../../../shared-kernel/clock.js';
import type { IdGenerator } from '../../../../shared-kernel/id-generator.js';
import type { AuditLog } from '../ports/audit-log.js';

export interface RecordB2bAccessDeps {
  readonly audit: AuditLog;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RecordB2bAccessCommand {
  readonly clientId: string;
  readonly endpoint: string;
  readonly recordCount: number;
}

/**
 * FR-B2B-09: writes one audit entry per B2B access, with the client, the endpoint, the time and the
 * number of records returned. A failure to write is not swallowed: the caller must not hand out
 * data that was not audited.
 */
export class RecordB2bAccess {
  constructor(private readonly deps: RecordB2bAccessDeps) {}

  execute(cmd: RecordB2bAccessCommand): Promise<void> {
    return this.deps.audit.record({
      id: this.deps.ids.next(),
      clientId: cmd.clientId,
      endpoint: cmd.endpoint,
      recordCount: Math.max(0, Math.trunc(cmd.recordCount)),
      at: this.deps.clock.now(),
    });
  }
}
