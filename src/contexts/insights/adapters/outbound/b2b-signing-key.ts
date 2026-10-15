import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import type { Logger } from '../../../../shared-kernel/logger.js';

/**
 * The ES256 key pair that signs and verifies B2B access tokens, with its `kid`. It is not the
 * mobile key (owner decision 2 of S0-09): each context owns its signing key (docs/07 §3).
 */
export interface B2bSigningKey {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly keyId: string;
}

/** The environment variables that decide the B2B signing key. */
export interface B2bSigningKeyConfig {
  readonly nodeEnv: string | undefined;
  /** `B2B_JWT_PRIVATE_KEY`: a PKCS#8 PEM for a P-256 key; literal `\n` is accepted for env files. */
  readonly privateKeyPem: string | undefined;
  /** `B2B_JWT_KEY_ID`: the `kid` header, needed with a configured key. */
  readonly keyId: string | undefined;
}

function loadConfigured(pem: string, keyId: string | undefined): B2bSigningKey {
  if (keyId === undefined || keyId === '')
    throw new Error(
      'B2B_JWT_KEY_ID is required together with B2B_JWT_PRIVATE_KEY',
    );
  const privateKey = createPrivateKey(pem.replaceAll('\\n', '\n'));
  const isP256 =
    privateKey.asymmetricKeyType === 'ec' &&
    privateKey.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  if (!isP256)
    throw new Error('B2B_JWT_PRIVATE_KEY must be a P-256 (ES256) key');
  return { privateKey, publicKey: createPublicKey(privateKey), keyId };
}

/**
 * The B2B signing key from configuration. Outside production a missing key is generated for this
 * process only (B2B tokens stop working at restart, a warning is logged); in production the
 * application does not start without one.
 */
export function loadB2bSigningKey(
  config: B2bSigningKeyConfig,
  logger: Logger,
): B2bSigningKey {
  const pem = config.privateKeyPem;
  if (pem !== undefined && pem !== '') return loadConfigured(pem, config.keyId);
  if (config.nodeEnv === 'production')
    throw new Error('B2B_JWT_PRIVATE_KEY is required with NODE_ENV=production');
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  logger.warn(
    'No B2B_JWT_PRIVATE_KEY configured; generated a B2B signing key for this process only. B2B access tokens stop working at restart.',
    { keyId: 'generated' },
  );
  return { ...pair, keyId: 'generated' };
}
