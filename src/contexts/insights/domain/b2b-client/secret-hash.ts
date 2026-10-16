import type { Branded } from '../../../../shared-kernel/ids.js';

/**
 * A client secret as stored (B2B_CLIENTS.secret_hash): only ever made by a SecretHasher and only
 * ever compared by one, never the secret itself (NFR-SEC-03). The text says how it was made.
 */
export type SecretHash = Branded<string, 'SecretHash'>;
