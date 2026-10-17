/**
 * Minimal logging port for adapters (docs/07 §6). Never pass personal data or feedback text in
 * `fields` (T-I4). Tests use a recording fake instead of spying on the console.
 */
export interface Logger {
  /** A normal event worth a line: a process or connection came up or went down. */
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
}
