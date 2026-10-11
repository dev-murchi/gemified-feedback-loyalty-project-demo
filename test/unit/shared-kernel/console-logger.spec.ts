import { ConsoleLogger } from '../../../src/shared-kernel/adapters/console-logger.js';

describe('ConsoleLogger', () => {
  it('writes one JSON line whose level and message cannot be overwritten by fields', () => {
    // Given a logger that writes to a list instead of the console
    const lines: string[] = [];
    const logger = new ConsoleLogger((line) => lines.push(line));

    // When a warning carries fields named like the reserved ones
    logger.warn('real message', {
      key: 'reward:f1',
      message: 'fake',
      level: 'debug',
    });

    // Then the real level and message win and the other fields are kept
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { key: 'reward:f1', level: 'warn', message: 'real message' },
    ]);
  });
});
