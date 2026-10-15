/** The five fixed sentiment labels (SDD 8.1); the LLM must answer with one of them. */
export const SENTIMENTS = [
  'happy',
  'satisfied',
  'neutral',
  'disappointed',
  'angry',
] as const;

export type Sentiment = (typeof SENTIMENTS)[number];

export const isSentiment = (value: unknown): value is Sentiment =>
  (SENTIMENTS as readonly unknown[]).includes(value);
