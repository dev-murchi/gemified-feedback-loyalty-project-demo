/** A feedback's status as reports see it (the API's `FeedbackStatusValue`). */
export type ReportedStatus = 'analyzing' | 'valid' | 'spam' | 'unanalyzed';

/** The five sentiment labels as reports see them (the API's `Sentiment`). */
export type ReportedSentiment =
  'happy' | 'satisfied' | 'neutral' | 'disappointed' | 'angry';
