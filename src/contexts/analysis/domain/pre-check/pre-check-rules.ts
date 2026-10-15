import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

export interface InvalidPreCheckRules extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'maxSameCharacterShare';
}

/**
 * The configurable threshold of the AI-free spam check (SDD 8.1, owner decision A of S0-08): a
 * comment is gibberish when one character makes up more than this share of its letters, digits
 * and emoji. To be tuned with the evaluation set (S0-13).
 */
export class PreCheckRules {
  private constructor(readonly maxSameCharacterShare: number) {}

  static create(input: {
    readonly maxSameCharacterShare: number;
  }): Result<PreCheckRules, InvalidPreCheckRules> {
    const share = input.maxSameCharacterShare;
    return share > 0 && share < 1
      ? ok(new PreCheckRules(share))
      : err({ code: 'VALIDATION_ERROR', field: 'maxSameCharacterShare' });
  }
}

const defaults = PreCheckRules.create({ maxSameCharacterShare: 0.6 });
if (!defaults.ok) throw new Error('Default pre-check rules are invalid');

export const DEFAULT_PRE_CHECK_RULES: PreCheckRules = defaults.value;
