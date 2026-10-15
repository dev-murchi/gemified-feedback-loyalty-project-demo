/** A feedback's status as reports see it (the API's `FeedbackStatusValue`). */
export type ReportedStatus = 'analyzing' | 'valid' | 'spam' | 'unanalyzed';

/** The five sentiment labels as reports see them (the API's `Sentiment`). */
export type ReportedSentiment =
  'happy' | 'satisfied' | 'neutral' | 'disappointed' | 'angry';

/**
 * What brands may see (FR-B2B-07): valid and unanalyzed feedback. Spam never appears in a list, a
 * summary or the heatmap, and a feedback still analyzing is not reported yet.
 */
export const REPORTABLE_STATUSES: readonly ReportedStatus[] = [
  'valid',
  'unanalyzed',
];

export const SENTIMENT_LABELS: readonly ReportedSentiment[] = [
  'happy',
  'satisfied',
  'neutral',
  'disappointed',
  'angry',
];
