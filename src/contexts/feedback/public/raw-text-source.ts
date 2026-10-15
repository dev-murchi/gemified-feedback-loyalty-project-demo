import type { FeedbackId } from '../../../shared-kernel/ids.js';

/**
 * What Analysis may know about a feedback before analyzing it: still analyzing, with the decrypted
 * comment; or no longer analyzing (already closed by its analysis or the 24-hour close, unknown,
 * or its raw text deleted), in which case there is nothing to analyze and no LLM call to pay for.
 */
export type RawTextLookup =
  | { readonly state: 'analyzing'; readonly text: string }
  | { readonly state: 'not_analyzing' };

/**
 * Open host service (docs/06 §3, §5.3): Analysis reads the raw comment only through this, already
 * decrypted; the encryption key stays in Feedback. An unreadable ciphertext throws
 * (RawTextUnreadableError), which fails the job.
 */
export interface RawTextSource {
  rawTextFor(feedbackId: FeedbackId): Promise<RawTextLookup>;
}
