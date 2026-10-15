import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

/** Where a page ended: the last item's submission time and id (newest first, id breaks ties). */
export interface CursorPosition {
  readonly submittedAt: Date;
  readonly id: string;
}

export interface InvalidCursor extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'cursor';
}

const INVALID: InvalidCursor = { code: 'VALIDATION_ERROR', field: 'cursor' };

/** Pure base64url, so the domain needs no Node Buffer. */
const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const fromBase64Url = (value: string): string => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const isPosition = (value: unknown): value is { s: string; i: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { s?: unknown }).s === 'string' &&
  typeof (value as { i?: unknown }).i === 'string';

/**
 * The opaque `cursor` / `nextCursor` (FR-B2B-03): base64url of the last item's position. Keyset
 * paging, not offsets, so a feedback arriving while a brand pages never repeats or skips an item
 * (TC-B2B-06). The client must not read it; a malformed one is VALIDATION_ERROR.
 */
export const Cursor = {
  encode(position: CursorPosition): string {
    return toBase64Url(
      JSON.stringify({ s: position.submittedAt.toISOString(), i: position.id }),
    );
  },

  decode(value: string): Result<CursorPosition, InvalidCursor> {
    try {
      const parsed: unknown = JSON.parse(fromBase64Url(value));
      if (!isPosition(parsed)) return err(INVALID);
      const submittedAt = new Date(parsed.s);
      return Number.isNaN(submittedAt.getTime())
        ? err(INVALID)
        : ok({ submittedAt, id: parsed.i });
    } catch {
      return err(INVALID);
    }
  },

  /** True if `item` comes after `position` in newest-first order (the next page starts after it). */
  isAfter(item: CursorPosition, position: CursorPosition): boolean {
    const a = item.submittedAt.getTime();
    const b = position.submittedAt.getTime();
    return a < b || (a === b && item.id < position.id);
  },
};
