/**
 * Where a feedback is in its life (FR-GAM-06; the same four words as `FeedbackStatus` in the API).
 * It leaves `analyzing` exactly once and never changes again (docs/06 §5.3).
 */
export type FeedbackStatus = 'analyzing' | 'valid' | 'spam' | 'unanalyzed';
