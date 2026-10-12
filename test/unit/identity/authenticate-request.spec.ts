import { FakeDevice } from '../../support/fake-device.js';
import { USER_ID } from '../../support/identity-builders.js';
import {
  registrationFixture,
  type RegistrationFixture,
} from '../../support/registration-fixture.js';

describe('AuthenticateRequest', () => {
  let fixture: RegistrationFixture;
  let device: FakeDevice;
  let token: string;

  beforeEach(async () => {
    // Given a device that registered and holds an access token
    fixture = await registrationFixture();
    device = new FakeDevice();
    const nonce = await fixture.issueNonce();
    const registered = await fixture.registerDevice.execute({
      nonce,
      evidence: device.androidEvidence(nonce),
    });
    if (!registered.ok) throw new Error('registration failed');
    token = registered.value.accessToken;
  });

  const authenticate = (authorization: string | undefined) =>
    fixture.authenticateRequest.execute({ authorization });

  it('tells who is calling from a valid bearer token', async () => {
    // When the request carries the token
    const result = await authenticate(`Bearer ${token}`);

    // Then the caller is the user, with the key and trust level of the token
    expect(result).toEqual({
      ok: true,
      value: {
        userId: USER_ID,
        keyIdentifier: device.androidKeyIdentifier,
        trustLevel: 'normal',
      },
    });
  });

  it('accepts the scheme name in any case (RFC 7235)', async () => {
    expect((await authenticate(`bearer ${token}`)).ok).toBe(true);
  });

  it.each([
    ['no Authorization header', undefined],
    ['an empty header', ''],
    ['another scheme', 'Basic dXNlcjpwYXNz'],
    ['a scheme without a token', 'Bearer '],
    ['a token with spaces', 'Bearer a b'],
    ['an unknown token', 'Bearer not-a-token-we-issued'],
  ])('answers UNAUTHORIZED for %s', async (_title, header) => {
    expect(await authenticate(header)).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('answers UNAUTHORIZED once the token has expired, 15 minutes after issue (TC-AUTH-08)', async () => {
    // Given a token that is still valid one second before its end
    fixture.clock.advance(899_000);
    expect((await authenticate(`Bearer ${token}`)).ok).toBe(true);

    // When the 15 minutes are over
    fixture.clock.advance(1_000);

    // Then it is UNAUTHORIZED
    expect(await authenticate(`Bearer ${token}`)).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });
});
