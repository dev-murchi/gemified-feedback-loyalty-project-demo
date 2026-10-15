import { isComplaint } from '../complaint.js';
import {
  SENTIMENT_LABELS,
  type ReportedSentiment,
  type ReportedStatus,
} from '../reported-feedback.js';

/** The facts a summary counts; only reportable feedback reaches it (REPORTABLE_STATUSES). */
export interface FeedbackFact {
  readonly status: ReportedStatus;
  readonly sentiment: ReportedSentiment | null;
  readonly topicKey: string | null;
}

export interface TopicCount {
  readonly key: string;
  readonly count: number;
}

/** The counts of one branch summary (FR-B2B-04, contract `BranchSummary`). */
export interface FeedbackTally {
  /** Valid and unanalyzed together; spam is never counted. */
  readonly total: number;
  readonly complaints: number;
  readonly unanalyzed: number;
  /** Valid feedback only: an unanalyzed one has no sentiment. */
  readonly sentiments: Readonly<Record<ReportedSentiment, number>>;
  /** At most five, most frequent first, the key breaking ties. */
  readonly topTopics: readonly TopicCount[];
}

export const TOP_TOPICS = 5;

const emptySentiments = (): Record<ReportedSentiment, number> =>
  Object.fromEntries(SENTIMENT_LABELS.map((label) => [label, 0])) as Record<
    ReportedSentiment,
    number
  >;

function topTopics(facts: readonly FeedbackFact[]): TopicCount[] {
  const counts = new Map<string, number>();
  for (const fact of facts)
    if (fact.status === 'valid' && fact.topicKey !== null)
      counts.set(fact.topicKey, (counts.get(fact.topicKey) ?? 0) + 1);
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, TOP_TOPICS);
}

/** Counts reportable feedback of one branch and period (the rules stay here, not in a query). */
export function tally(facts: readonly FeedbackFact[]): FeedbackTally {
  const sentiments = emptySentiments();
  for (const fact of facts)
    if (fact.status === 'valid' && fact.sentiment !== null)
      sentiments[fact.sentiment] += 1;
  return {
    total: facts.length,
    complaints: facts.filter((fact) => isComplaint(fact.status, fact.sentiment))
      .length,
    unanalyzed: facts.filter((fact) => fact.status === 'unanalyzed').length,
    sentiments,
    topTopics: topTopics(facts),
  };
}
