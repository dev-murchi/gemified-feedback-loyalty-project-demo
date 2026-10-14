import type { DomainError } from '../../../../shared-kernel/domain-error.js';

/**
 * No such feedback for this user: unknown, malformed id, or another user's (GET /v1/feedbacks/{id}
 * answers all three alike); API code NOT_FOUND (404).
 */
export type FeedbackNotFound = DomainError<'NOT_FOUND'>;
