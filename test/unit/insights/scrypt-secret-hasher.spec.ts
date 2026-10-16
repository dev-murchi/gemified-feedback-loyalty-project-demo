import type { SecretHash } from '../../../src/contexts/insights/domain/b2b-client/secret-hash.js';
import { ScryptSecretHasher } from '../../../src/contexts/insights/adapters/outbound/scrypt-secret-hasher.js';

const hasher = new ScryptSecretHasher();

describe('ScryptSecretHasher (owner decision 1 of S0-09)', () => {
  let hash: SecretHash;

  beforeAll(async () => {
    hash = await hasher.hash('correct horse battery staple');
  });

  it('stores no secret: the hash names its parameters and has a salt', () => {
    expect(hash).toMatch(
      /^scrypt\$131072\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
    expect(hash).not.toContain('correct horse');
  });

  it('accepts the right secret and refuses another', async () => {
    expect(await hasher.verify('correct horse battery staple', hash)).toBe(
      true,
    );
    expect(await hasher.verify('correct horse battery stapl', hash)).toBe(
      false,
    );
  });

  it('salts every hash, so the same secret never hashes the same way', async () => {
    expect(await hasher.hash('correct horse battery staple')).not.toBe(hash);
  });

  it.each([
    '',
    'fake$secret',
    'scrypt$1$8$1$AAAA$AAAA',
    'scrypt$131072$8$1$c2FsdHNhbHRzYWx0c2FsdA==$AAAA',
  ])(
    'refuses an unreadable or broken hash %j without throwing',
    async (broken) => {
      expect(
        await hasher.verify(
          'correct horse battery staple',
          broken as SecretHash,
        ),
      ).toBe(false);
    },
  );
});
