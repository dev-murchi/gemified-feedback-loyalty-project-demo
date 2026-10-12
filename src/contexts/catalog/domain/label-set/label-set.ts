import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import {
  andThen,
  err,
  map,
  ok,
  type Result,
} from '../../../../shared-kernel/result.js';
import type { Sector } from '../sector.js';
import { OTHER_TOPIC, TopicKey } from '../topic-key.js';

export interface Topic {
  readonly key: TopicKey;
  readonly name: string;
}

export interface LabelSetState {
  readonly sector: Sector;
  readonly labelSetVersion: number;
  readonly topics: readonly Topic[];
}

export interface NewLabelSet {
  readonly sector: Sector;
  readonly labelSetVersion: number;
  readonly topics: readonly { readonly key: string; readonly name: string }[];
}

export interface InvalidLabelSet extends DomainError<'VALIDATION_ERROR'> {
  readonly reason:
    | 'version'
    | 'topic_key'
    | 'topic_name'
    | 'duplicate_topic'
    | 'missing_other';
}

const invalid = (
  reason: InvalidLabelSet['reason'],
): Result<never, InvalidLabelSet> => err({ code: 'VALIDATION_ERROR', reason });

/**
 * The versioned topic list of a sector (docs/06 §5.2). A published label set never changes; a
 * change is a new version. Every label set contains the `other` topic (TZ-12).
 */
export class LabelSet extends AggregateRoot {
  readonly #state: LabelSetState;

  private constructor(state: LabelSetState, version: number) {
    super(version);
    this.#state = state;
  }

  static create(labelSet: NewLabelSet): Result<LabelSet, InvalidLabelSet> {
    const checked = andThen(checkVersion(labelSet.labelSetVersion), () =>
      parseTopics(labelSet.topics),
    );
    return map(checked, (topics) => new LabelSet({ ...labelSet, topics }, 0));
  }

  static reconstitute(state: LabelSetState, version: number): LabelSet {
    return new LabelSet(state, version);
  }

  get sector(): Sector {
    return this.#state.sector;
  }

  get labelSetVersion(): number {
    return this.#state.labelSetVersion;
  }

  get topics(): readonly Topic[] {
    return this.#state.topics;
  }
}

function checkVersion(labelSetVersion: number): Result<void, InvalidLabelSet> {
  return Number.isInteger(labelSetVersion) && labelSetVersion >= 1
    ? ok(undefined)
    : invalid('version');
}

function parseTopics(
  raw: NewLabelSet['topics'],
): Result<Topic[], InvalidLabelSet> {
  const topics: Topic[] = [];
  for (const candidate of raw) {
    const key = TopicKey.create(candidate.key);
    const name = candidate.name.trim();
    if (!key.ok) return invalid('topic_key');
    if (name === '') return invalid('topic_name');
    topics.push({ key: key.value, name });
  }
  return checkTopicList(topics);
}

function checkTopicList(topics: Topic[]): Result<Topic[], InvalidLabelSet> {
  const keys = new Set(topics.map((topic) => topic.key));
  if (keys.size !== topics.length) return invalid('duplicate_topic');
  if (!keys.has(OTHER_TOPIC as TopicKey)) return invalid('missing_other');
  return ok(topics);
}
