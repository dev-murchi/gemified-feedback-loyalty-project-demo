import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

export interface InvalidKeyCursor extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'cursor';
}

const INVALID: InvalidKeyCursor = { code: 'VALIDATION_ERROR', field: 'cursor' };

/**
 * The opaque cursor of a list ordered by one key (the branch list, by id): base64url of the last
 * key. The client must not read it; a malformed one is VALIDATION_ERROR.
 */
export const KeyCursor = {
  encode(key: string): string {
    return btoa(JSON.stringify({ k: key }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  },

  decode(value: string): Result<string, InvalidKeyCursor> {
    try {
      const parsed: unknown = JSON.parse(
        atob(value.replaceAll('-', '+').replaceAll('_', '/')),
      );
      const key = (parsed as { k?: unknown } | null)?.k;
      return typeof key === 'string' && key !== '' ? ok(key) : err(INVALID);
    } catch {
      return err(INVALID);
    }
  },
};
