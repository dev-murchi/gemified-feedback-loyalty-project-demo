import type { Logger } from '../logger.js';

/**
 * Writes warnings as one JSON line to the console (global, no import); a structured logger later.
 * Fields come first, so a field named `level` or `message` can never overwrite the real ones.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly writeLine: (line: string) => void = (line) =>
      console.warn(line),
  ) {}

  warn(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.writeLine(JSON.stringify({ ...fields, level: 'warn', message }));
  }
}
