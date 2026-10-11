import type { IdGenerator } from '../id-generator.js';

/** Random UUID v4 via the global Web Crypto API (no import, so the shared kernel stays pure). */
export class RandomIdGenerator implements IdGenerator {
  next(): string {
    return crypto.randomUUID();
  }
}
