import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { JoseB2bTokens } from '../../../src/contexts/insights/adapters/outbound/jose-b2b-tokens.js';
import { JoseAccessTokens } from '../../../src/contexts/identity/adapters/outbound/jose-access-tokens.js';
import type { KeyIdentifier } from '../../../src/contexts/identity/domain/user/key-identifier.js';
import type { B2bSigningKey } from '../../../src/contexts/insights/adapters/outbound/b2b-signing-key.js';
import type { UserId } from '../../../src/shared-kernel/ids.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  B2B_BRAND_ID,
  CLIENT_ID,
  NOW,
} from '../../support/insights-builders.js';

const keyPair = (keyId: string): B2bSigningKey => ({
  ...generateKeyPairSync('ec', { namedCurve: 'prime256v1' }),
  keyId,
});

const CLAIMS = {
  clientId: CLIENT_ID,
  brandId: B2B_BRAND_ID,
  scopes: ['b2b.feedback.read'] as const,
};

describe('JoseB2bTokens (owner decision 2 of S0-09)', () => {
  let clock: FakeClock;
  let key: B2bSigningKey;
  let tokens: JoseB2bTokens;

  beforeEach(() => {
    clock = new FakeClock(NOW);
    key = keyPair('b2b-1');
    tokens = new JoseB2bTokens({ key, clock });
  });

  const signWith = (
    signingKey: B2bSigningKey,
    payload: Record<string, unknown>,
    aud?: string,
  ) => {
    const jwt = new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', kid: signingKey.keyId })
      .setSubject(CLIENT_ID)
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 900);
    return (aud === undefined ? jwt : jwt.setAudience(aud)).sign(
      signingKey.privateKey,
    );
  };

  it('round-trips the client, brand and scopes', async () => {
    const { accessToken } = await tokens.issue({
      ...CLAIMS,
      scopes: [...CLAIMS.scopes],
    });

    expect(await tokens.verify(accessToken)).toEqual({
      ok: true,
      value: { ...CLAIMS, scopes: ['b2b.feedback.read'] },
    });
  });

  it('expires after 15 minutes', async () => {
    const { accessToken, expiresIn } = await tokens.issue({
      ...CLAIMS,
      scopes: [...CLAIMS.scopes],
    });
    clock.advance(expiresIn * 1000);

    expect(await tokens.verify(accessToken)).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('refuses a mobile access token, even one signed with the same key', async () => {
    // A mobile token as Identity issues it: no aud, no brand, no scope
    const mobile = new JoseAccessTokens({ key, clock });
    const { accessToken } = await mobile.issue({
      userId: '00000000-0000-4000-8000-000000000001' as UserId,
      keyIdentifier:
        'Yz7kQ2mF9xR4tW1vB6nH3jL8pD5sA0gE2cU7iO4yT1q' as KeyIdentifier,
      trustLevel: 'normal',
    });

    expect((await tokens.verify(accessToken)).ok).toBe(false);
  });

  it('is refused by the mobile verifier, which uses the other key', async () => {
    const { accessToken } = await tokens.issue({
      ...CLAIMS,
      scopes: [...CLAIMS.scopes],
    });
    const mobile = new JoseAccessTokens({ key: keyPair('mobile-1'), clock });

    expect((await mobile.verify(accessToken)).ok).toBe(false);
  });

  it.each<[string, () => Promise<string>]>([
    [
      'another key',
      () =>
        signWith(
          keyPair('b2b-1'),
          { brand_id: B2B_BRAND_ID, scope: 'b2b.feedback.read' },
          'b2b',
        ),
    ],
    [
      'no audience',
      () =>
        signWith(key, { brand_id: B2B_BRAND_ID, scope: 'b2b.feedback.read' }),
    ],
    [
      'another audience',
      () =>
        signWith(
          key,
          { brand_id: B2B_BRAND_ID, scope: 'b2b.feedback.read' },
          'mobile',
        ),
    ],
    ['no brand', () => signWith(key, { scope: 'b2b.feedback.read' }, 'b2b')],
    [
      'an unknown scope',
      () =>
        signWith(key, { brand_id: B2B_BRAND_ID, scope: 'b2b.admin' }, 'b2b'),
    ],
    [
      'no scope at all',
      () => signWith(key, { brand_id: B2B_BRAND_ID, scope: '' }, 'b2b'),
    ],
  ])('refuses a token with %s', async (_case, make) => {
    expect(await tokens.verify(await make())).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('refuses a token with another kid, even from the right key', async () => {
    const { accessToken } = await new JoseB2bTokens({
      key: { ...key, keyId: 'b2b-0' },
      clock,
    }).issue({
      ...CLAIMS,
      scopes: [...CLAIMS.scopes],
    });

    expect((await tokens.verify(accessToken)).ok).toBe(false);
  });

  it('refuses garbage', async () => {
    expect((await tokens.verify('not.a.jwt')).ok).toBe(false);
  });
});
