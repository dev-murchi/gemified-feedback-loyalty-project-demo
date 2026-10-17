import type { Logger } from '../logger.js';

type Level = 'info' | 'warn';

const toConsole = (line: string, level: Level): void =>
  level === 'warn' ? console.warn(line) : console.info(line);

/**
 * Writes one JSON line per message to the console (global, no import); a structured logger later.
 * Fields come first, so a field named `level` or `message` can never overwrite the real ones.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly writeLine: (
      line: string,
      level: Level,
    ) => void = toConsole,
  ) {}

  info(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#write('info', message, fields);
  }

  warn(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#write('warn', message, fields);
  }

  #write(
    level: Level,
    message: string,
    fields: Readonly<Record<string, unknown>>,
  ): void {
    this.writeLine(JSON.stringify({ ...fields, level, message }), level);
  }
}
