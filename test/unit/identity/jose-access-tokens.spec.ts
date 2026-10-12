import {
  decodeJwt,
  decodeProtectedHeader,
  SignJWT,
  UnsecuredJWT,
  type JWTPayload,
} from 'jose';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { JoseAccessTokens } from '../../../src/contexts/identity/adapters/outbound/jose-access-tokens.js';
import { loadSigningKey } from '../../../src/contexts/identity/adapters/outbound/signing-key.js';
import type { AccessTokenClaims } from '../../../src/contexts/identity/domain/session/access-token-claims.js';
import { FakeClock } from '../../support/fake-clock.js';
import { KEY_IDENTIFIER, USER_ID } from '../../support/identity-builders.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const CLAIMS: AccessTokenClaims = {
  userId: USER_ID,
  keyIdentifier: KEY_IDENTIFIER,
  trustLevel: 'normal',
};
const UNAUTHORIZED = { ok: false, error: { code: 'UNAUTHORIZED' } };

describe('JoseAccessTokens', () => {
  const clock = new FakeClock(new Date('2026-10-13T09:00:00.000Z'));
  const key = loadSigningKey(
    { nodeEnv: 'test', privateKeyPem: undefined, keyId: undefined },
    new RecordingLogger(),
  );
  const tokens = new JoseAccessTokens({ key, clock });
  const now = () => Math.floor(clock.now().getTime() / 1000);

  /** A correctly shaped payload; a field set to undefined is left out. */
  const payload = (overrides: Record<string, unknown> = {}): JWTPayload =>
    Object.fromEntries(
      Object.entries({
        dk: KEY_IDENTIFIER,
        trust: 'normal',
        sub: USER_ID,
        iat: now(),
        exp: now() + 900,
        ...overrides,
      }).filter(([, value]) => value !== undefined),
    );

  const forge = (
    claims: JWTPayload,
    signWith: KeyObject = key.privateKey,
    kid: string = key.keyId,
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid })
      .sign(signWith);

  beforeEach(() => clock.set(new Date('2026-10-13T09:00:00.000Z')));

  it('issues an ES256 token for 15 minutes with the documented claims (SDD 7.1)', async () => {
    // When a token is issued
    const issued = await tokens.issue(CLAIMS);

    // Then it is ES256 with our kid and carries sub, dk and trust, expiring after 900 seconds
    expect(issued.expiresIn).toBe(900);
    expect(decodeProtectedHeader(issued.accessToken)).toMatchObject({
      alg: 'ES256',
      kid: key.keyId,
    });
    const claims = decodeJwt(issued.accessToken);
    expect(claims).toMatchObject({
      sub: USER_ID,
      dk: KEY_IDENTIFIER,
      trust: 'normal',
      iat: now(),
      exp: now() + 900,
    });
  });

  it('reads its own token back into the same claims, trust level included', async () => {
    // Given tokens for a normal and a low-trust user
    const normal = await tokens.issue(CLAIMS);
    const low = await tokens.issue({ ...CLAIMS, trustLevel: 'low' });

    // When they are verified
    // Then the claims come back unchanged
    expect(await tokens.verify(normal.accessToken)).toEqual({
      ok: true,
      value: CLAIMS,
    });
    expect(await tokens.verify(low.accessToken)).toEqual({
      ok: true,
      value: { ...CLAIMS, trustLevel: 'low' },
    });
  });

  it('expires exactly 900 seconds after issue (TC-AUTH-08)', async () => {
    // Given a token issued now
    const { accessToken } = await tokens.issue(CLAIMS);

    // When time passes: one second before the end, then the end
    clock.advance(899_000);
    const before = await tokens.verify(accessToken);
    clock.advance(1_000);
    const after = await tokens.verify(accessToken);

    // Then it is valid first and UNAUTHORIZED at 15 minutes
    expect(before.ok).toBe(true);
    expect(after).toEqual(UNAUTHORIZED);
  });

  describe('refuses tokens that are not ours', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

    it('answers UNAUTHORIZED for garbage', async () => {
      for (const token of ['', 'abc', 'a.b.c', 'a.b']) {
        expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
      }
    });

    it('rejects a token whose payload was changed after signing', async () => {
      // Given a token whose payload is swapped for a different user's
      const { accessToken } = await tokens.issue(CLAIMS);
      const [header, , signature] = accessToken.split('.');
      const swapped = Buffer.from(
        JSON.stringify(
          payload({ sub: 'ffffffff-0000-4000-8000-000000000001' }),
        ),
      ).toString('base64url');

      // When it is verified
      // Then the signature no longer matches
      expect(await tokens.verify(`${header}.${swapped}.${signature}`)).toEqual(
        UNAUTHORIZED,
      );
    });

    it('rejects a token signed with another key', async () => {
      const token = await forge(payload(), other.privateKey);
      expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
    });

    it('rejects an unsigned token (alg none)', async () => {
      const token = new UnsecuredJWT(payload()).encode();
      expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
    });

    it('rejects an HS256 token that uses our public key as the secret', async () => {
      // Given the classic algorithm-confusion attack
      const secret = key.publicKey.export({ type: 'spki', format: 'der' });
      const token = await new SignJWT(payload())
        .setProtectedHeader({ alg: 'HS256', kid: key.keyId })
        .sign(new Uint8Array(secret));

      // When it is verified
      // Then only ES256 is accepted
      expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
    });

    it('rejects a correctly signed token with another kid', async () => {
      const token = await forge(payload(), key.privateKey, 'another-key');
      expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
    });

    it('rejects a correctly signed token without an expiry', async () => {
      const token = await forge(payload({ exp: undefined }));
      expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
    });

    it.each([
      ['no sub', { sub: undefined }],
      ['a sub that is not a user id', { sub: 'not-a-uuid' }],
      ['no dk', { dk: undefined }],
      ['a dk that is not a key identifier', { dk: '??' }],
      ['a dk of the wrong type', { dk: 42 }],
      ['no trust', { trust: undefined }],
      ['an unknown trust level', { trust: 'admin' }],
    ])('rejects a correctly signed token with %s', async (_title, change) => {
      const token = await forge(payload(change));
      expect(await tokens.verify(token)).toEqual(UNAUTHORIZED);
    });
  });
});
