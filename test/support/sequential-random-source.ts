import type { RandomSource } from '../../src/shared-kernel/random-source.js';

/**
 * Predictable "random" bytes for tests. Every call returns different bytes (the first four hold
 * the call number), so generated tokens are unique, and `calls` records what was handed out.
 */
export class SequentialRandomSource implements RandomSource {
  readonly calls: Uint8Array[] = [];

  bytes(length: number): Uint8Array {
    const call = this.calls.length + 1;
    const bytes = Uint8Array.from({ length }, (_, index) => index + 1);
    new DataView(bytes.buffer).setUint32(0, call);
    this.calls.push(bytes.slice());
    return bytes;
  }
}
