import type { Logger } from '../../src/shared-kernel/logger.js';

export interface LoggedMessage {
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export type LoggedWarning = LoggedMessage;

/** A Logger fake that keeps what was logged, so tests can assert it without spying on the console. */
export class RecordingLogger implements Logger {
  readonly infos: LoggedMessage[] = [];
  readonly warnings: LoggedWarning[] = [];

  info(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.infos.push({ message, fields });
  }

  warn(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.warnings.push({ message, fields });
  }
}
