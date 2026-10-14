import { createHash } from 'node:crypto';
import type { Hasher } from '../../application/ports/hasher.js';

export class NodeHasher implements Hasher {
  sha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
