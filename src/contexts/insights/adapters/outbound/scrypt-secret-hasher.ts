import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import type { SecretHasher } from '../../application/ports/secret-hasher.js';

const KEY_BYTES = 32;
const SALT_BYTES = 16;
/** OWASP's minimum for scrypt: N = 2^17, r = 8, p = 1 (about 128 MiB × p of memory per hash). */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const MAX_MEMORY = 256 * 1024 * 1024;

const derive = (
  secret: string,
  salt: Buffer,
  params: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      secret,
      salt,
      KEY_BYTES,
      { ...params, maxmem: MAX_MEMORY },
      (error, key) => {
        if (error === null) resolve(key);
        else reject(error);
      },
    );
  });

/** `scrypt$N$r$p$salt$hash` with base64 salt and hash; anything else is unreadable. */
const FORMAT =
  /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

/**
 * Client secrets hashed with scrypt from `node:crypto` (owner decision 1 of S0-09; no download):
 * a random salt per secret, the parameters stored in the hash, constant-time comparison.
 */
export class ScryptSecretHasher implements SecretHasher {
  async hash(secret: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(secret, salt, PARAMS);
    return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(secret: string, hash: string): Promise<boolean> {
    const match = FORMAT.exec(hash);
    if (match === null) return false;
    const [, n, r, p, salt, expected] = match;
    const wanted = Buffer.from(expected ?? '', 'base64');
    try {
      const key = await derive(secret, Buffer.from(salt ?? '', 'base64'), {
        N: Number(n),
        r: Number(r),
        p: Number(p),
      });
      return key.length === wanted.length && timingSafeEqual(key, wanted);
    } catch {
      return false;
    }
  }
}
