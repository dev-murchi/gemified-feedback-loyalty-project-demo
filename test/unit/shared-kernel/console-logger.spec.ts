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

  it('writes an info line with its own level, so the console can route it', () => {
    const written: { line: string; level: string }[] = [];
    const logger = new ConsoleLogger((line, level) =>
      written.push({ line, level }),
    );

    logger.info('Worker started', { driver: 'bullmq' });
    logger.warn('Redis connection lost');

    expect(
      written.map(({ line, level }) => ({
        level,
        json: JSON.parse(line) as unknown,
      })),
    ).toEqual([
      {
        level: 'info',
        json: { driver: 'bullmq', level: 'info', message: 'Worker started' },
      },
      {
        level: 'warn',
        json: { level: 'warn', message: 'Redis connection lost' },
      },
    ]);
  });
});
