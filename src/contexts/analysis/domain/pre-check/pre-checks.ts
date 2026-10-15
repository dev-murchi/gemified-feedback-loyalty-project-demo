import type { PreCheckRules } from './pre-check-rules.js';

/** Passed: the comment goes to the LLM. Gibberish: spam without an LLM call, no sentiment, no topic. */
export type PreCheckVerdict =
  { readonly outcome: 'passed' } | { readonly outcome: 'gibberish' };

const LETTER = /\p{L}/u;
/** What counts towards the share: letters, digits and emoji. Spaces and punctuation never do. */
const COUNTED = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

/** The counted characters, case-folded so that "aAaA" is one character four times. */
const countedCharacters = (text: string): string[] =>
  [...text.toLocaleLowerCase('tr')].filter((char) => COUNTED.test(char));

const largestShare = (characters: readonly string[]): number => {
  const counts = new Map<string, number>();
  for (const char of characters) counts.set(char, (counts.get(char) ?? 0) + 1);
  return Math.max(...counts.values()) / characters.length;
};

/**
 * The AI-free checks before masking and the LLM (SDD 8.1, FR-AI-08). Deliberately narrow (owner
 * decision A of S0-08): a comment is gibberish only when it has no letter at all (only emoji,
 * symbols or digits), or when one character makes up more than the configured share of its
 * letters, digits and emoji. Everything else goes to the LLM; profanity is never a reason here.
 */
export class PreChecks {
  constructor(private readonly rules: PreCheckRules) {}

  check(text: string): PreCheckVerdict {
    if (!LETTER.test(text)) return { outcome: 'gibberish' };
    const characters = countedCharacters(text);
    return largestShare(characters) > this.rules.maxSameCharacterShare
      ? { outcome: 'gibberish' }
      : { outcome: 'passed' };
  }
}
