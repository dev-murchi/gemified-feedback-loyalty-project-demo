import { createCipheriv, createDecipheriv } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import type { RawTextCipher } from '../../application/ports/raw-text-cipher.js';
import { RawTextUnreadableError } from '../../application/ports/raw-text-unreadable-error.js';
import type { EncryptedRawText } from '../../domain/feedback/raw-text.js';
import type { RawTextKey } from './raw-text-key.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DATA_KEY_BYTES = 32;

/** The key and the encryption context (the feedback id) that go together in one seal. */
interface Sealing {
  readonly key: Uint8Array | KeyObject;
  readonly context: string;
}

/** Encrypts with AES-256-GCM; the result is iv ‖ tag ‖ ciphertext as base64. */
function seal(
  sealing: Sealing,
  plain: Uint8Array,
  random: RandomSource,
): string {
  const iv = random.bytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, sealing.key, iv);
  cipher.setAAD(Buffer.from(sealing.context));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** The plain bytes, or undefined if the key, the context or the data is not the one sealed. */
function open(sealing: Sealing, sealed: string): Buffer | undefined {
  const bytes = Buffer.from(sealed, 'base64');
  if (bytes.length < IV_BYTES + TAG_BYTES) return undefined;
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      sealing.key,
      bytes.subarray(0, IV_BYTES),
    );
    decipher.setAAD(Buffer.from(sealing.context));
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    return undefined;
  }
}

export interface LocalRawTextCipherDeps {
  readonly masterKey: RawTextKey;
  readonly random: RandomSource;
}

/**
 * Envelope encryption with a local master key: the demo's stand-in for KMS behind the same port
 * (SDD 6.5, §11.1). Each comment gets its own data key; the feedback id is the context of both
 * encryptions, so a ciphertext moved to another feedback fails to open.
 */
export class LocalRawTextCipher implements RawTextCipher {
  constructor(private readonly deps: LocalRawTextCipherDeps) {}

  encrypt(feedbackId: FeedbackId, text: string): Promise<EncryptedRawText> {
    const { masterKey, random } = this.deps;
    const dataKey = random.bytes(DATA_KEY_BYTES);
    return Promise.resolve({
      ciphertext: seal(
        { key: dataKey, context: feedbackId },
        Buffer.from(text, 'utf8'),
        random,
      ),
      encryptedDataKey: seal(
        { key: masterKey.key, context: feedbackId },
        dataKey,
        random,
      ),
      keyId: masterKey.keyId,
    });
  }

  decrypt(
    feedbackId: FeedbackId,
    encrypted: EncryptedRawText,
  ): Promise<string> {
    const { masterKey } = this.deps;
    const dataKey =
      encrypted.keyId === masterKey.keyId
        ? open(
            { key: masterKey.key, context: feedbackId },
            encrypted.encryptedDataKey,
          )
        : undefined;
    const plain =
      dataKey &&
      open({ key: dataKey, context: feedbackId }, encrypted.ciphertext);
    return plain
      ? Promise.resolve(plain.toString('utf8'))
      : Promise.reject(new RawTextUnreadableError());
  }
}
