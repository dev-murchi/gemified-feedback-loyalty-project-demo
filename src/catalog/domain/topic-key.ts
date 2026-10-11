import type { DomainError } from '../../shared-kernel/domain-error.js';
import type { Branded } from '../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../shared-kernel/result.js';

/**
 * The fixed English key of a topic (e.g. `toilet_cleanliness`). Display names may change; the key
 * never does, so historical data stays comparable (SDD 6.1, TZ-12).
 */
export type TopicKey = Branded<string, 'TopicKey'>;

export interface InvalidTopicKey extends DomainError<'VALIDATION_ERROR'> {
  readonly value: string;
}

/** Every label set must contain this topic (docs/06 §5.2). */
export const OTHER_TOPIC = 'other';

const FORMAT = /^[a-z][a-z0-9_]*$/;

export const TopicKey = {
  create(raw: string): Result<TopicKey, InvalidTopicKey> {
    return FORMAT.test(raw)
      ? ok(raw as TopicKey)
      : err({ code: 'VALIDATION_ERROR', value: raw });
  },
};
