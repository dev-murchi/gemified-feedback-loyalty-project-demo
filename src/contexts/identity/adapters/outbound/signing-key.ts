import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import type { Logger } from '../../../../shared-kernel/logger.js';

/** The ES256 key pair that signs and verifies access tokens (SDD 7.1), with its `kid`. */
export interface SigningKey {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly keyId: string;
}

/** The environment variables that decide the signing key (decision 4 of S0-05). */
export interface SigningKeyConfig {
  readonly nodeEnv: string | undefined;
  /** `JWT_PRIVATE_KEY`: a PKCS#8 PEM for a P-256 key; literal `\n` is accepted for env files. */
  readonly privateKeyPem: string | undefined;
  /** `JWT_KEY_ID`: the `kid` header, needed with a configured key. */
  readonly keyId: string | undefined;
}

const hasKey = (config: SigningKeyConfig): boolean =>
  config.privateKeyPem !== undefined && config.privateKeyPem !== '';

function loadConfigured(pem: string, keyId: string | undefined): SigningKey {
  if (keyId === undefined || keyId === '')
    throw new Error('JWT_KEY_ID is required together with JWT_PRIVATE_KEY');
  const privateKey = createPrivateKey(pem.replaceAll('\\n', '\n'));
  const isP256 =
    privateKey.asymmetricKeyType === 'ec' &&
    privateKey.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  if (!isP256) throw new Error('JWT_PRIVATE_KEY must be a P-256 (ES256) key');
  return { privateKey, publicKey: createPublicKey(privateKey), keyId };
}

/**
 * The signing key from configuration. Outside production a missing key is generated for this
 * process only (tokens stop working at restart, which is fine for development); in production the
 * application does not start without one (a key that vanishes at restart would log everyone out,
 * and a generated one cannot be rotated or shared between instances).
 */
export function loadSigningKey(
  config: SigningKeyConfig,
  logger: Logger,
): SigningKey {
  if (hasKey(config))
    return loadConfigured(config.privateKeyPem ?? '', config.keyId);
  if (config.nodeEnv === 'production')
    throw new Error('JWT_PRIVATE_KEY is required with NODE_ENV=production');
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  logger.warn(
    'No JWT_PRIVATE_KEY configured; generated a signing key for this process only. Access tokens stop working at restart.',
    { keyId: 'generated' },
  );
  return { ...pair, keyId: 'generated' };
}
