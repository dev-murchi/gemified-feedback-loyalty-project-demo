import {
  FeedbackText,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
} from '../../../src/contexts/feedback/domain/feedback-text.js';

const errorOf = (raw: string) => {
  const result = FeedbackText.create(raw);
  return result.ok ? undefined : result.error;
};

describe('FeedbackText', () => {
  it('accepts 20 and 1 000 characters and rejects 19 and 1 001 (FR-AI-01)', () => {
    expect(MIN_TEXT_LENGTH).toBe(20);
    expect(MAX_TEXT_LENGTH).toBe(1000);
    expect(FeedbackText.create('a'.repeat(20)).ok).toBe(true);
    expect(FeedbackText.create('a'.repeat(1000)).ok).toBe(true);
    expect(errorOf('a'.repeat(19))).toEqual({
      code: 'TEXT_TOO_SHORT',
      length: 19,
    });
    expect(errorOf('a'.repeat(1001))).toEqual({
      code: 'TEXT_TOO_LONG',
      length: 1001,
    });
  });

  it('counts an emoji as one character: 1 000 emojis pass, 1 001 are TEXT_TOO_LONG (TC-API-02)', () => {
    expect(FeedbackText.create('😀'.repeat(1000)).ok).toBe(true);
    expect(errorOf('😀'.repeat(1001))).toEqual({
      code: 'TEXT_TOO_LONG',
      length: 1001,
    });
  });

  it('counts after NFC normalization: a letter with a combining accent is one character', () => {
    // 'e' + combining acute accent (2 code points) becomes 'é' (1) under NFC
    const decomposed = 'é'.repeat(20);
    expect(decomposed.length).toBe(40);
    expect(FeedbackText.create(decomposed).ok).toBe(true);
    expect(errorOf('é'.repeat(19))).toEqual({
      code: 'TEXT_TOO_SHORT',
      length: 19,
    });
  });

  it('keeps the normalized text and does not trim it', () => {
    const result = FeedbackText.create(`  ${'é'.repeat(20)}  `);

    expect(result.ok && result.value).toBe(`  ${'é'.repeat(20)}  `);
  });

  it('reports a long text as too long, never as a generic validation error', () => {
    expect(errorOf('x'.repeat(5000))?.code).toBe('TEXT_TOO_LONG');
    expect(errorOf('')?.code).toBe('TEXT_TOO_SHORT');
  });
});
