import { KeyIdentifier } from '../../../src/contexts/identity/domain/user/key-identifier.js';
import { PublicKey } from '../../../src/contexts/identity/domain/user/public-key.js';
import {
  KEY_IDENTIFIER,
  OTHER_KEY_IDENTIFIER,
  PUBLIC_KEY,
} from '../../support/identity-builders.js';

describe('KeyIdentifier', () => {
  it.each([
    ['Android fingerprint (base64url)', KEY_IDENTIFIER],
    ['iOS key id (standard base64)', OTHER_KEY_IDENTIFIER],
  ])('accepts an %s', (_kind, raw) => {
    // Given a well-formed key identifier
    // When it is parsed
    // Then it is accepted unchanged
    expect(KeyIdentifier.parse(raw)).toEqual({ ok: true, value: raw });
  });

  it.each(['', 'short', 'has spaces in it, not base64', 'x'.repeat(129)])(
    'rejects %j as a validation error on keyId',
    (raw) => {
      // Given a malformed key identifier
      // When it is parsed
      const parsed = KeyIdentifier.parse(raw);

      // Then it is rejected
      expect(parsed.ok ? undefined : parsed.error).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'keyId',
      });
    },
  );
});

describe('PublicKey', () => {
  it('accepts standard base64', () => {
    // Given DER SPKI bytes as standard base64
    // When they are parsed
    // Then they are accepted unchanged
    expect(PublicKey.parse(PUBLIC_KEY)).toEqual({
      ok: true,
      value: PUBLIC_KEY,
    });
  });

  it.each(['', 'abc', 'a-b_cdef', 'abcd=efg', '====', 'A'.repeat(1028)])(
    'rejects %j as a validation error on publicKey',
    (raw) => {
      // Given something that is not standard base64 of a sensible size
      // When it is parsed
      const parsed = PublicKey.parse(raw);

      // Then it is rejected
      expect(parsed.ok ? undefined : parsed.error).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'publicKey',
      });
    },
  );
});
