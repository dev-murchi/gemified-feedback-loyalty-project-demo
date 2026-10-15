// Small builders and fakes for Insights tests.

import type { SecretHasher } from '../../src/contexts/insights/application/ports/secret-hasher.js';
import {
  B2bClient,
  type B2bClientState,
} from '../../src/contexts/insights/domain/b2b-client/b2b-client.js';
import type { BrandId } from '../../src/shared-kernel/ids.js';

export const CLIENT_ID = 'brand-a-panel';
export const CLIENT_SECRET = 'correct horse battery staple';
export const B2B_BRAND_ID = 'b0000000-0000-4000-8000-0000000000b1' as BrandId;
export const OTHER_B2B_BRAND_ID =
  'b0000000-0000-4000-8000-0000000000b2' as BrandId;
export const NOW = new Date('2026-10-16T09:00:00.000Z');

/** A fast stand-in for scrypt in use-case tests; ScryptSecretHasher has its own tests. */
export const fakeHasher: SecretHasher = {
  hash: (secret) => Promise.resolve(`fake$${secret}`),
  verify: (secret, hash) => Promise.resolve(hash === `fake$${secret}`),
};

/** An active client of B2B_BRAND_ID with both scopes, its secret hashed by fakeHasher. */
export const aClient = (
  overrides: Partial<Omit<B2bClientState, 'revokedAt'>> = {},
): B2bClient =>
  B2bClient.create({
    clientId: CLIENT_ID,
    brandId: B2B_BRAND_ID,
    secretHash: `fake$${CLIENT_SECRET}`,
    scopes: ['b2b.feedback.read', 'b2b.summary.read'],
    expiresAt: null,
    ...overrides,
  });
