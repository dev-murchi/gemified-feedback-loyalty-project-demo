import type { DomainError } from '../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../shared-kernel/result.js';

/**
 * A feedback text without control characters, after NFC normalization, between 20 and 1 000 code
 * points (FR-AI-01).
 */
export type FeedbackText = Branded<string, 'FeedbackText'>;

/** Control characters other than tab, line feed and carriage return (SDD 7.5, SRS CR-007). */
const CONTROL_CHARACTERS = /(?![\t\n\r])\p{Cc}/gu;

export const MIN_TEXT_LENGTH = 20;
export const MAX_TEXT_LENGTH = 1000;

/** Shorter than 20 code points; API code TEXT_TOO_SHORT (422). */
export interface TextTooShort extends DomainError<'TEXT_TOO_SHORT'> {
  readonly length: number;
}

/** Longer than 1 000 code points; API code TEXT_TOO_LONG (422, never the generic 400). */
export interface TextTooLong extends DomainError<'TEXT_TOO_LONG'> {
  readonly length: number;
}

export type InvalidFeedbackText = TextTooShort | TextTooLong;

export const FeedbackText = {
  /**
   * Removes control characters other than tab and line breaks, applies NFC, then counts Unicode
   * code points (an emoji is one character, FR-AI-01, TC-API-02). The text is not trimmed: what the
   * customer wrote is what is kept and analyzed.
   */
  create(raw: string): Result<FeedbackText, InvalidFeedbackText> {
    const text = raw.replace(CONTROL_CHARACTERS, '').normalize('NFC');
    const length = [...text].length;
    if (length < MIN_TEXT_LENGTH)
      return err({ code: 'TEXT_TOO_SHORT', length });
    if (length > MAX_TEXT_LENGTH) return err({ code: 'TEXT_TOO_LONG', length });
    return ok(text as FeedbackText);
  },
};
