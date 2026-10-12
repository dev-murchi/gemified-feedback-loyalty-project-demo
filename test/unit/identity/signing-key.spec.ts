import { generateKeyPairSync } from 'node:crypto';
import { JoseAccessTokens } from '../../../src/contexts/identity/adapters/outbound/jose-access-tokens.js';
import { loadSigningKey } from '../../../src/contexts/identity/adapters/outbound/signing-key.js';
import { FakeClock } from '../../support/fake-clock.js';
import { KEY_IDENTIFIER, USER_ID } from '../../support/identity-builders.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const pemOf = (curve: 'prime256v1' | 'secp384r1') =>
  generateKeyPairSync('ec', { namedCurve: curve })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

const claims = {
  userId: USER_ID,
  keyIdentifier: KEY_IDENTIFIER,
  trustLevel: 'normal',
} as const;

describe('loadSigningKey (JWT_PRIVATE_KEY, JWT_KEY_ID)', () => {
  let logger: RecordingLogger;

  beforeEach(() => {
    logger = new RecordingLogger();
  });

  it('loads the configured key, so every instance with the same key verifies the same tokens', async () => {
    // Given two key loads from the same configuration
    const config = {
      nodeEnv: 'production',
      privateKeyPem: pemOf('prime256v1'),
      keyId: 'k1',
    };
    const clock = new FakeClock();
    const issuer = new JoseAccessTokens({
      key: loadSigningKey(config, logger),
      clock,
    });
    const verifier = new JoseAccessTokens({
      key: loadSigningKey(config, logger),
      clock,
    });

    // When one issues and the other verifies
    const { accessToken } = await issuer.issue(claims);

    // Then the token is accepted, and nothing was logged
    expect((await verifier.verify(accessToken)).ok).toBe(true);
    expect(logger.warnings).toEqual([]);
  });

  it('accepts a PEM written on one line with literal \\n, as env files need', () => {
    const pem = pemOf('prime256v1').trim().replaceAll('\n', '\\n');
    const key = loadSigningKey(
      { nodeEnv: 'production', privateKeyPem: pem, keyId: 'k1' },
      logger,
    );
    expect(key.keyId).toBe('k1');
  });

  it('generates a key for this process outside production and says so', () => {
    // When no key is configured in development
    const key = loadSigningKey(
      { nodeEnv: 'development', privateKeyPem: undefined, keyId: undefined },
      logger,
    );

    // Then a usable key exists and a warning explains it
    expect(key.privateKey.asymmetricKeyType).toBe('ec');
    expect(logger.warnings).toHaveLength(1);
  });

  it.each([undefined, ''])(
    'refuses to start in production without a key (JWT_PRIVATE_KEY=%j)',
    (privateKeyPem) => {
      expect(() =>
        loadSigningKey(
          { nodeEnv: 'production', privateKeyPem, keyId: 'k1' },
          logger,
        ),
      ).toThrow();
    },
  );

  it('refuses a configured key without a key id', () => {
    expect(() =>
      loadSigningKey(
        {
          nodeEnv: 'development',
          privateKeyPem: pemOf('prime256v1'),
          keyId: undefined,
        },
        logger,
      ),
    ).toThrow();
  });

  it('refuses a key that is not P-256', () => {
    expect(() =>
      loadSigningKey(
        {
          nodeEnv: 'development',
          privateKeyPem: pemOf('secp384r1'),
          keyId: 'k1',
        },
        logger,
      ),
    ).toThrow();
  });

  it('refuses text that is not a key', () => {
    expect(() =>
      loadSigningKey(
        { nodeEnv: 'development', privateKeyPem: 'garbage', keyId: 'k1' },
        logger,
      ),
    ).toThrow();
  });
});
