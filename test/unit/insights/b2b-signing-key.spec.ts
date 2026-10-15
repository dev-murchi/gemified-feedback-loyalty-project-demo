import { generateKeyPairSync } from 'node:crypto';
import { loadB2bSigningKey } from '../../../src/contexts/insights/adapters/outbound/b2b-signing-key.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const pemOf = (curve: 'prime256v1' | 'secp384r1') =>
  generateKeyPairSync('ec', { namedCurve: curve })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

describe('loadB2bSigningKey (B2B_JWT_PRIVATE_KEY, B2B_JWT_KEY_ID)', () => {
  let logger: RecordingLogger;

  beforeEach(() => {
    logger = new RecordingLogger();
  });

  it('loads a configured P-256 key, also written on one line with literal \\n', () => {
    const pem = pemOf('prime256v1').trim().replaceAll('\n', '\\n');

    const key = loadB2bSigningKey(
      {
        nodeEnv: 'production',
        privateKeyPem: pem,
        keyId: 'b2b-1',
      },
      logger,
    );

    expect(key.keyId).toBe('b2b-1');
    expect(logger.warnings).toEqual([]);
  });

  it('generates a key outside production and names the variable in the warning', () => {
    const key = loadB2bSigningKey(
      { nodeEnv: 'development', privateKeyPem: '', keyId: '' },
      logger,
    );

    expect(key.keyId).toBe('generated');
    expect(logger.warnings[0]?.message).toContain('B2B_JWT_PRIVATE_KEY');
  });

  it('does not start in production without a key', () => {
    expect(() =>
      loadB2bSigningKey(
        {
          nodeEnv: 'production',
          privateKeyPem: undefined,
          keyId: undefined,
        },
        logger,
      ),
    ).toThrow('B2B_JWT_PRIVATE_KEY is required with NODE_ENV=production');
  });

  it('needs a key id and a P-256 key', () => {
    expect(() =>
      loadB2bSigningKey(
        {
          nodeEnv: 'production',
          privateKeyPem: pemOf('prime256v1'),
          keyId: '',
        },
        logger,
      ),
    ).toThrow('B2B_JWT_KEY_ID is required together with B2B_JWT_PRIVATE_KEY');
    expect(() =>
      loadB2bSigningKey(
        {
          nodeEnv: 'production',
          privateKeyPem: pemOf('secp384r1'),
          keyId: 'k',
        },
        logger,
      ),
    ).toThrow('B2B_JWT_PRIVATE_KEY must be a P-256 (ES256) key');
  });
});
