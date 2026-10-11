/**
 * Minimal logging port for adapters (docs/07 §6). Never pass personal data or feedback text in
 * `fields` (T-I4). Tests use a recording fake instead of spying on the console.
 */
export interface Logger {
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
}
