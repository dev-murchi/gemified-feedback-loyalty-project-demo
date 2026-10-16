/** One B2B access as B2B_AUDIT_LOG stores it (SDD 6.1, FR-B2B-09). */
export interface AuditEntry {
  readonly id: string;
  readonly clientId: string;
  /** The method and route template, e.g. `GET /v1/b2b/branches/:branchId/summary`. */
  readonly endpoint: string;
  /** How many records the response carried; 0 when the request failed. */
  readonly recordCount: number;
  readonly at: Date;
}

/**
 * The append-only record of B2B data access (FR-B2B-09, threat T-R2: a brand cannot deny what it
 * read, and a leak can be traced to a client). Entries are never changed or deleted here.
 */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
