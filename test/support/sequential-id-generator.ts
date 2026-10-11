import type { IdGenerator } from '../../src/shared-kernel/id-generator.js';

/** Predictable UUIDs for tests: 00000000-0000-4000-8000-000000000001, …0002, … */
export class SequentialIdGenerator implements IdGenerator {
  #count = 0;

  next(): string {
    this.#count += 1;
    return `00000000-0000-4000-8000-${String(this.#count).padStart(12, '0')}`;
  }
}
