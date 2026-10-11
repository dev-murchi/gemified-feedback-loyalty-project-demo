import {
  LabelSet,
  type NewLabelSet,
} from '../../../src/catalog/domain/label-set/label-set.js';

const valid: NewLabelSet = {
  sector: 'coffee',
  labelSetVersion: 1,
  topics: [
    { key: 'taste', name: 'Lezzet' },
    { key: 'other', name: 'Diğer' },
  ],
};

const reasonOf = (input: NewLabelSet): string | undefined => {
  const result = LabelSet.create(input);
  return result.ok ? undefined : result.error.reason;
};

describe('LabelSet', () => {
  it('accepts a topic list that contains `other`', () => {
    // Given a valid label set
    // When it is created
    const result = LabelSet.create(valid);

    // Then it keeps its sector, version and topics
    expect(result.ok && result.value.topics.map((topic) => topic.key)).toEqual([
      'taste',
      'other',
    ]);
  });

  it('rejects a topic list without `other` (docs/06 §5.2)', () => {
    // Given topics without `other`
    const input = { ...valid, topics: [{ key: 'taste', name: 'Lezzet' }] };

    // When it is created
    // Then it is rejected for the missing `other` topic
    expect(reasonOf(input)).toBe('missing_other');
  });

  it('rejects the same topic key twice', () => {
    // Given a duplicated key
    const input = {
      ...valid,
      topics: [...valid.topics, { key: 'taste', name: 'Tat' }],
    };

    // When it is created
    // Then it is rejected as a duplicate
    expect(reasonOf(input)).toBe('duplicate_topic');
  });

  it.each(['Taste', '1taste', 'taste-good', ''])(
    'rejects the topic key %j',
    (key) => {
      // Given a key that is not lower-case snake case
      const input = { ...valid, topics: [{ key, name: 'X' }, ...valid.topics] };

      // When it is created
      // Then it is rejected for its key
      expect(reasonOf(input)).toBe('topic_key');
    },
  );

  it('rejects an empty topic name', () => {
    // Given a topic without a name
    const input = {
      ...valid,
      topics: [
        { key: 'taste', name: ' ' },
        { key: 'other', name: 'Diğer' },
      ],
    };

    // When it is created
    // Then it is rejected for the name
    expect(reasonOf(input)).toBe('topic_name');
  });

  it.each([0, -1, 1.5])(
    'rejects the label set version %d',
    (labelSetVersion) => {
      // Given an invalid version number
      // When it is created
      // Then it is rejected for the version
      expect(reasonOf({ ...valid, labelSetVersion })).toBe('version');
    },
  );
});
