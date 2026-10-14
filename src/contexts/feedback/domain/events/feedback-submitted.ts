// Published event: imports only the shared kernel, never Feedback's own value objects (docs/07 §4).

import type { DomainEvent } from '../../../../shared-kernel/domain-event.js';
import type { BranchId, FeedbackId } from '../../../../shared-kernel/ids.js';

/**
 * Published by Feedback when a feedback is accepted (docs/06 §6). The only asynchronous boundary
 * (ADR-020): it is written to the outbox in the same transaction and delivered to the analysis
 * queue. It carries no comment text.
 */
export interface FeedbackSubmitted extends DomainEvent<'FeedbackSubmitted'> {
  readonly aggregateId: FeedbackId;
  readonly branchId: BranchId;
  /** The branch's sector (Catalog's `CatalogSector`); Analysis picks the topic list from it. */
  readonly sector: string;
  readonly submittedAt: Date;
  /** The request id of the submission, to follow one feedback through the logs. */
  readonly correlationId: string;
}
