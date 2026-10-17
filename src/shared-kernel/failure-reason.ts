/** The error's name and message only: a failure reason must never carry the payload. */
export const reasonOf = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
