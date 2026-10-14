import { createSecretKey } from 'node:crypto';
import { RawTextUnreadableError } from '../../../src/contexts/feedback/application/ports/raw-text-unreadable-error.js';
import { LocalRawTextCipher } from '../../../src/contexts/feedback/adapters/outbound/local-raw-text.cipher.js';
import { loadRawTextKey } from '../../../src/contexts/feedback/adapters/outbound/raw-text-key.js';
import { CryptoRandomSource } from '../../../src/shared-kernel/adapters/crypto-random-source.js';
import { feedbackId } from '../../support/feedback-builders.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const random = new CryptoRandomSource();
const keyOf = (id: string) => ({
  key: createSecretKey(random.bytes(32)),
  keyId: id,
});
const cipherWith = (masterKey = keyOf('k1')) =>
  new LocalRawTextCipher({ masterKey, random });

const TEXT = 'Pompa çalışmıyordu, 0532 000 00 00 numarasından arayın 😀';

const change = (base64: string): string => {
  const bytes = Buffer.from(base64, 'base64');
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
  return bytes.toString('base64');
};

describe('LocalRawTextCipher (envelope encryption, SDD 6.5)', () => {
  it('opens what it sealed, including Turkish letters and emoji', async () => {
    const cipher = cipherWith();

    const encrypted = await cipher.encrypt(feedbackId(1), TEXT);
    const decrypted = await cipher.decrypt(feedbackId(1), encrypted);

    expect(decrypted).toBe(TEXT);
  });

  it('stores no plain text and names the master key', async () => {
    const encrypted = await cipherWith().encrypt(feedbackId(1), TEXT);

    expect(JSON.stringify(encrypted)).not.toContain('Pompa');
    expect(encrypted.keyId).toBe('k1');
  });

  it('gives each comment its own data key and a fresh iv: the same text never seals the same way', async () => {
    const cipher = cipherWith();

    const first = await cipher.encrypt(feedbackId(1), TEXT);
    const second = await cipher.encrypt(feedbackId(1), TEXT);

    expect(second.ciphertext).not.toBe(first.ciphertext);
    expect(second.encryptedDataKey).not.toBe(first.encryptedDataKey);
  });

  it('cannot open a ciphertext moved to another feedback (encryption context)', async () => {
    const cipher = cipherWith();
    const encrypted = await cipher.encrypt(feedbackId(1), TEXT);

    await expect(
      cipher.decrypt(feedbackId(2), encrypted),
    ).rejects.toBeInstanceOf(RawTextUnreadableError);
  });

  it.each(['ciphertext', 'encryptedDataKey'] as const)(
    'detects a changed %s',
    async (field) => {
      const cipher = cipherWith();
      const encrypted = await cipher.encrypt(feedbackId(1), TEXT);

      const run = cipher.decrypt(feedbackId(1), {
        ...encrypted,
        [field]: change(encrypted[field]),
      });

      await expect(run).rejects.toBeInstanceOf(RawTextUnreadableError);
    },
  );

  it('cannot open with another master key, nor with a key id it does not know', async () => {
    const encrypted = await cipherWith(keyOf('k1')).encrypt(
      feedbackId(1),
      TEXT,
    );

    const otherKey = cipherWith(keyOf('k1')).decrypt(feedbackId(1), encrypted);
    const otherId = cipherWith(keyOf('k2')).decrypt(feedbackId(1), encrypted);

    await expect(otherKey).rejects.toBeInstanceOf(RawTextUnreadableError);
    await expect(otherId).rejects.toBeInstanceOf(RawTextUnreadableError);
  });

  it('refuses garbage and too-short input with the same error, not a crypto error', async () => {
    const run = cipherWith().decrypt(feedbackId(1), {
      ciphertext: 'AAAA',
      encryptedDataKey: '',
      keyId: 'k1',
    });

    await expect(run).rejects.toBeInstanceOf(RawTextUnreadableError);
  });
});

describe('loadRawTextKey (RAW_TEXT_KEY, RAW_TEXT_KEY_ID)', () => {
  let logger: RecordingLogger;
  const base64Key = () => Buffer.from(random.bytes(32)).toString('base64');
  const load = (config: Parameters<typeof loadRawTextKey>[0]) =>
    loadRawTextKey(config, { random, logger });

  beforeEach(() => {
    logger = new RecordingLogger();
  });

  it('loads the configured key: two instances with it open each other’s comments', async () => {
    const config = {
      nodeEnv: 'production',
      keyBase64: base64Key(),
      keyId: 'k1',
    };
    const writer = new LocalRawTextCipher({ masterKey: load(config), random });
    const reader = new LocalRawTextCipher({ masterKey: load(config), random });

    const encrypted = await writer.encrypt(feedbackId(1), TEXT);

    expect(await reader.decrypt(feedbackId(1), encrypted)).toBe(TEXT);
    expect(logger.warnings).toEqual([]);
  });

  it('generates a key outside production and says so', () => {
    const key = load({ nodeEnv: 'development', keyBase64: '', keyId: '' });

    expect(key.keyId).toBe('generated');
    expect(logger.warnings).toHaveLength(1);
  });

  it('does not start in production without a key', () => {
    expect(() =>
      load({ nodeEnv: 'production', keyBase64: undefined, keyId: undefined }),
    ).toThrow('RAW_TEXT_KEY is required with NODE_ENV=production');
  });

  it('needs a key id with a configured key', () => {
    expect(() =>
      load({ nodeEnv: 'production', keyBase64: base64Key(), keyId: '' }),
    ).toThrow('RAW_TEXT_KEY_ID is required');
  });

  it.each([
    ['too short', Buffer.from(random.bytes(16)).toString('base64')],
    ['too long', Buffer.from(random.bytes(48)).toString('base64')],
    ['not base64', 'not base64 at all!!'],
  ])('rejects a key that is %s', (_label, keyBase64) => {
    expect(() =>
      load({ nodeEnv: 'production', keyBase64, keyId: 'k1' }),
    ).toThrow('RAW_TEXT_KEY must be 32 bytes encoded as base64');
  });
});
