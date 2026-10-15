import type { ReportedSentiment, ReportedStatus } from './reported-feedback.js';

/** The sentiments that make a valid feedback a complaint (FR-B2B-04). */
const COMPLAINT_SENTIMENTS: readonly ReportedSentiment[] = [
  'disappointed',
  'angry',
];

/**
 * A complaint is a valid feedback whose sentiment is "Hayal kırıklığı" or "Öfkeli" (FR-B2B-04).
 * Spam and unanalyzed feedback are never complaints: their sentiment is unknown or meaningless.
 */
export const isComplaint = (
  status: ReportedStatus,
  sentiment: ReportedSentiment | null,
): boolean =>
  status === 'valid' &&
  sentiment !== null &&
  COMPLAINT_SENTIMENTS.includes(sentiment);
