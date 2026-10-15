import { parseLlmOutput } from '../../../src/contexts/analysis/domain/feedback-analysis/llm-output.js';

const TOPICS = ['pump', 'toilet_cleanliness', 'other'];
const valid = {
  sentiment: 'angry',
  topicKey: 'pump',
  isValid: true,
  spamReason: null,
};

describe('parseLlmOutput (FR-AI-03, FR-AI-04, TC-AI-02)', () => {
  it('accepts an answer in the schema with a topic of the label set', () => {
    expect(parseLlmOutput(valid, TOPICS)).toEqual(valid);
  });

  it('accepts spam with one of the four reasons', () => {
    expect(
      parseLlmOutput(
        { ...valid, isValid: false, spamReason: 'advertisement' },
        TOPICS,
      ),
    ).toMatchObject({ isValid: false, spamReason: 'advertisement' });
  });

  it.each<[string, unknown]>([
    ['a sentiment outside the five', { ...valid, sentiment: 'furious' }],
    ['a topic outside the label set', { ...valid, topicKey: 'parking' }],
    [
      'a missing field',
      { sentiment: 'angry', topicKey: 'pump', isValid: true },
    ],
    ['an extra field', { ...valid, give: 'xp' }],
    ['isValid as a string', { ...valid, isValid: 'true' }],
    ['a valid comment with a spam reason', { ...valid, spamReason: 'other' }],
    ['spam without a reason', { ...valid, isValid: false, spamReason: null }],
    [
      'spam with an unknown reason',
      { ...valid, isValid: false, spamReason: 'rude' },
    ],
    ['plain text', 'angry, pump'],
    ['an array', [valid]],
    ['null', null],
  ])('rejects %s as off-schema', (_case, output) => {
    expect(parseLlmOutput(output, TOPICS)).toBeUndefined();
  });
});
