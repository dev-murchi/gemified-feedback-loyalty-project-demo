// Published event: imports only the shared kernel, never Identity's own value objects (docs/07 §4).

import type { DomainEvent } from '../../../../shared-kernel/domain-event.js';
import type { UserId } from '../../../../shared-kernel/ids.js';

/**
 * Published by Identity when a user is created (docs/06 §6); Gamification opens the user's wallet
 * in the same unit of work. Defined here so the User aggregate can record it; other contexts import
 * it only from identity/public/.
 */
export interface UserRegistered extends DomainEvent<'UserRegistered'> {
  /** The new user. */
  readonly aggregateId: UserId;
}
