import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { UserId } from '../../shared-kernel/ids.js';

/**
 * Published by Identity when a user is created (docs/06 §6); Gamification opens the user's wallet
 * in the same unit of work. Contract written first, in S0-06; Identity (S0-05) publishes exactly
 * this type.
 */
export interface UserRegistered extends DomainEvent<'UserRegistered'> {
  /** The new user. */
  readonly aggregateId: UserId;
}
