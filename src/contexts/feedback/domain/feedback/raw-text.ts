/** Years the raw comment is kept before it is deleted (FR-PRIV-03). */
export const RAW_TEXT_RETENTION_YEARS = 2;

/**
 * A raw comment as it is stored: envelope-encrypted (SDD 6.5). The domain never sees the plain
 * text; the `RawTextCipher` port makes and opens this. All fields are base64 text or an id.
 */
export interface EncryptedRawText {
  readonly ciphertext: string;
  /** The per-comment data key, encrypted with the master key. */
  readonly encryptedDataKey: string;
  /** Which master key encrypted the data key (the KMS key id in production). */
  readonly keyId: string;
}

export interface StoredRawText extends EncryptedRawText {
  /** When the scheduled job deletes it (FR-PRIV-03). */
  readonly retainUntil: Date;
}

export function rawTextRetainUntil(submittedAt: Date): Date {
  const until = new Date(submittedAt);
  until.setUTCFullYear(until.getUTCFullYear() + RAW_TEXT_RETENTION_YEARS);
  return until;
}
