export type Json = Record<string, unknown>;

export const parseJson = (text: string): unknown => {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** JSON text that is printed into a response exactly as it is, not re-serialized. */
export interface RawJson {
  readonly rawJson: string;
}

export const isRawJson = (value: unknown): value is RawJson =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { rawJson?: unknown }).rawJson === 'string';
