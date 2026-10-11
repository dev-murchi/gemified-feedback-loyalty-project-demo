import type { RandomSource } from '../random-source.js';

/** Secure random bytes via the global Web Crypto API (no import, so the shared kernel stays pure). */
export class CryptoRandomSource implements RandomSource {
  bytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }
}
