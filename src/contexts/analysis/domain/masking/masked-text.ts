import type { Branded } from '../../../../shared-kernel/ids.js';

/** A comment with its personal data replaced by placeholders: the only text sent to the LLM or shown to brands. */
export type MaskedText = Branded<string, 'MaskedText'>;
