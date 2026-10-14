import { createSecretKey, type KeyObject } from 'node:crypto';
import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import type { Logger } from '../../../../shared-kernel/logger.js';

/** The AES-256 master key that wraps the data keys of raw comments (SDD 6.5), with its id. */
export interface RawTextKey {
  readonly key: KeyObject;
  readonly keyId: string;
}

/** The environment variables that decide the master key. */
export interface RawTextKeyConfig {
  readonly nodeEnv: string | undefined;
  /** `RAW_TEXT_KEY`: 32 random bytes as base64 (`openssl rand -base64 32`). */
  readonly keyBase64: string | undefined;
  /** `RAW_TEXT_KEY_ID`: stored with every comment so a later key can be told apart. */
  readonly keyId: string | undefined;
}

const KEY_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const hasKey = (config: RawTextKeyConfig): boolean =>
  config.keyBase64 !== undefined && config.keyBase64 !== '';

function loadConfigured(base64: string, keyId: string | undefined): RawTextKey {
  if (keyId === undefined || keyId === '')
    throw new Error('RAW_TEXT_KEY_ID is required together with RAW_TEXT_KEY');
  const bytes = BASE64.test(base64) ? Buffer.from(base64, 'base64') : undefined;
  if (bytes?.length !== KEY_BYTES)
    throw new Error('RAW_TEXT_KEY must be 32 bytes encoded as base64');
  return { key: createSecretKey(bytes), keyId };
}

/**
 * The master key from configuration. Outside production a missing key is generated for this
 * process only (the demo store is in memory, so nothing outlives the key); in production the
 * application does not start without one, because comments encrypted with a vanished key could
 * never be read again.
 */
export function loadRawTextKey(
  config: RawTextKeyConfig,
  deps: { readonly random: RandomSource; readonly logger: Logger },
): RawTextKey {
  if (hasKey(config))
    return loadConfigured(config.keyBase64 ?? '', config.keyId);
  if (config.nodeEnv === 'production')
    throw new Error('RAW_TEXT_KEY is required with NODE_ENV=production');
  deps.logger.warn(
    'No RAW_TEXT_KEY configured; generated a key for this process only. Stored raw comments cannot be read after a restart.',
    { keyId: 'generated' },
  );
  return {
    key: createSecretKey(deps.random.bytes(KEY_BYTES)),
    keyId: 'generated',
  };
}
