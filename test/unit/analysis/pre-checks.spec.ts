import { PreChecks } from '../../../src/contexts/analysis/domain/pre-check/pre-checks.js';
import {
  DEFAULT_PRE_CHECK_RULES,
  PreCheckRules,
} from '../../../src/contexts/analysis/domain/pre-check/pre-check-rules.js';

const checks = new PreChecks(DEFAULT_PRE_CHECK_RULES);
const verdictOf = (text: string) => checks.check(text).outcome;

describe('PreChecks (SDD 8.1, owner decision A)', () => {
  it('passes ordinary comments on to the LLM', () => {
    expect(verdictOf('Tuvaletler çok kirliydi, sabun da yoktu.')).toBe(
      'passed',
    );
    expect(verdictOf('Kahve harikaydı, teşekkürler 😀')).toBe('passed');
  });

  it('passes a real complaint with profanity: profanity is never a pre-check reason (TC-AI-10)', () => {
    expect(verdictOf('Bu ne lan böyle, berbat bir hizmet, rezalet!')).toBe(
      'passed',
    );
  });

  it('passes a terse repeated-word complaint (the rule option B would have blocked)', () => {
    expect(verdictOf('rezalet rezalet rezalet rezalet rezalet rezalet')).toBe(
      'passed',
    );
  });

  it.each([
    ['only emoji', '😀😀😀😡😡😡🤬🤬🤬😀😀😀😡😡😡🤬🤬🤬😀😀'],
    ['only digits', '12345678901234567890'],
    ['only symbols and punctuation', '!!!!!!!!!!??????????.......'],
    ['emoji, digits and symbols, no letter', '😀 123 !!! 😀 456 ??? 😀 789'],
  ])('calls a text with no letter gibberish: %s', (_case, text) => {
    expect(verdictOf(text)).toBe('gibberish');
  });

  it('calls a text gibberish when one character is more than 60 % of its letters, digits and emoji', () => {
    // 'a' is 13 of 20 counted characters (65 %)
    expect(verdictOf('aaaaaaaaaaaaabcdefgh')).toBe('gibberish');
  });

  it('keeps a text at exactly 60 % (the rule is "more than")', () => {
    // 'a' is 12 of 20 counted characters
    expect(verdictOf('aaaaaaaaaaaabcdefghi')).toBe('passed');
  });

  it('ignores spaces and punctuation in the share, so "!!!!!" or wide spacing never trigger it', () => {
    expect(
      verdictOf('Çok    kötü     bir      deneyimdi       !!!!!!!!!!!!!!!!!!!'),
    ).toBe('passed');
    expect(verdictOf('b e r b a t  h i z m e t  . . . . . . . . . .')).toBe(
      'passed',
    );
  });

  it('passes a short real comment even when spaces or "!" would be most of the text if counted', () => {
    // Counted, the spaces would be 30 of 38 characters and the "!" 20 of 24
    expect(verdictOf(`iyi${' '.repeat(30)}değil`)).toBe('passed');
    expect(verdictOf(`Rezalet${'!'.repeat(20)}`)).toBe('passed');
  });

  it('counts upper and lower case as one character', () => {
    expect(verdictOf('aAaAaAaAaAaAaAbcdefg')).toBe('gibberish');
  });

  it('lets the threshold be configured', () => {
    // Given a stricter threshold of 50 %
    const rules = PreCheckRules.create({ maxSameCharacterShare: 0.5 });
    if (!rules.ok) throw new Error('rules are invalid');

    // Then 55 % is gibberish
    expect(
      new PreChecks(rules.value).check('aaaaaaaaaaabcdefghij').outcome,
    ).toBe('gibberish');
  });

  it.each([0, 1, -0.1, 1.5, Number.NaN])(
    'rejects a threshold of %s',
    (share) => {
      expect(PreCheckRules.create({ maxSameCharacterShare: share })).toEqual({
        ok: false,
        error: { code: 'VALIDATION_ERROR', field: 'maxSameCharacterShare' },
      });
    },
  );
});
