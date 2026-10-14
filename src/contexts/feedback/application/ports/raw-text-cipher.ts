import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type { EncryptedRawText } from '../../domain/feedback/raw-text.js';

/**
 * Envelope encryption of the raw comment (SDD 6.5, NFR-PRIV-02): a data key per comment, itself
 * encrypted with a master key (KMS in production, a local key in the demo). The feedback id is the
 * encryption context, so a ciphertext copied to another feedback cannot be opened.
 */
export interface RawTextCipher {
  encrypt(feedbackId: FeedbackId, text: string): Promise<EncryptedRawText>;
  /** Throws RawTextUnreadableError if the ciphertext, its context or its key does not match. */
  decrypt(feedbackId: FeedbackId, encrypted: EncryptedRawText): Promise<string>;
}
