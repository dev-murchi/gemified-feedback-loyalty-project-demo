import type { MaskedText } from './masked-text.js';
import { isValidTckn, passesLuhn } from './checksums.js';

/** One kind of personal data: what finds a candidate, and whether the candidate is really one. */
interface MaskingRule {
  readonly pattern: RegExp;
  readonly placeholder: string;
  readonly accepts?: (digits: string) => boolean;
}

const onlyDigits = (match: string): string => match.replace(/\D/g, '');

/** No digit directly before or after: a rule never takes part of a longer number. */
const NUMBER_START = '(?<![\\d])';
const NUMBER_END = '(?![\\d])';

/**
 * The rules of SDD 8.6, in the order they run. E-mail first (it may contain digits), then the
 * numbers from the longest and best-checked (IBAN, card with Luhn, TCKN with check digits) to the
 * loosest (phone), then plates. Names are not masked in the MVP (TZ-8, SRS CR-007).
 */
const RULES: readonly MaskingRule[] = [
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    placeholder: '[EPOSTA]',
  },
  {
    pattern: /\bTR\d{2}(?: ?\d{4}){5} ?\d{2}\b/gi,
    placeholder: '[IBAN]',
  },
  {
    pattern: new RegExp(
      `${NUMBER_START}\\d(?:[ -]?\\d){12,18}${NUMBER_END}`,
      'g',
    ),
    placeholder: '[KART]',
    accepts: passesLuhn,
  },
  {
    pattern: new RegExp(`${NUMBER_START}[1-9]\\d{10}${NUMBER_END}`, 'g'),
    placeholder: '[TCKN]',
    accepts: isValidTckn,
  },
  {
    pattern: new RegExp(
      `${NUMBER_START}(?:(?:\\+|00)90[ -]*|0[ -]*)?\\(?[2-5]\\d{2}\\)?[ -]*\\d{3}[ -]*\\d{2}[ -]*\\d{2}${NUMBER_END}`,
      'g',
    ),
    placeholder: '[TELEFON]',
  },
  {
    pattern: /\b(?:0[1-9]|[1-7]\d|8[01]) ?[A-Z]{1,3} ?\d{2,4}\b/g,
    placeholder: '[PLAKA]',
  },
];

const apply = (text: string, rule: MaskingRule): string =>
  text.replace(rule.pattern, (match) =>
    rule.accepts === undefined || rule.accepts(onlyDigits(match))
      ? rule.placeholder
      : match,
  );

/**
 * Replaces personal data with typed placeholders before anything leaves the system (FR-AI-07,
 * SDD 8.6), so the model still understands "a phone number was here". Over-masking is the safe
 * side: a 10-digit order number that looks like a phone number is masked too.
 */
export class PiiMasker {
  mask(text: string): MaskedText {
    return RULES.reduce(apply, text) as MaskedText;
  }
}
