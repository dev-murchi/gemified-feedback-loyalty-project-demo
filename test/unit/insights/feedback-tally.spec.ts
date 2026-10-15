import { tally } from '../../../src/contexts/insights/domain/summary/feedback-tally.js';

describe('tally (FR-B2B-04)', () => {
  it('counts sentiments and complaints of valid feedback only, even if another fact carries a sentiment', () => {
    const counts = tally([
      { status: 'valid', sentiment: 'angry', topicKey: 'price' },
      { status: 'unanalyzed', sentiment: 'angry', topicKey: 'price' },
      { status: 'unanalyzed', sentiment: null, topicKey: null },
    ]);

    expect(counts).toEqual({
      total: 3,
      complaints: 1,
      unanalyzed: 2,
      sentiments: {
        happy: 0,
        satisfied: 0,
        neutral: 0,
        disappointed: 0,
        angry: 1,
      },
      topTopics: [{ key: 'price', count: 1 }],
    });
  });

  it('gives zeros and no topics for no feedback', () => {
    expect(tally([])).toMatchObject({
      total: 0,
      complaints: 0,
      unanalyzed: 0,
      topTopics: [],
    });
  });
});
