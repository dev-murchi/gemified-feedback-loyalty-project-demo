import type { Logger } from '../../src/shared-kernel/logger.js';

export interface LoggedWarning {
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** A Logger fake that keeps warnings, so tests can assert them without spying on the console. */
export class RecordingLogger implements Logger {
  readonly warnings: LoggedWarning[] = [];

  warn(message: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.warnings.push({ message, fields });
  }
}
