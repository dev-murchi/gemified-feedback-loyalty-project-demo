import type {
  PlatformProofRequest,
  PlatformProofVerifier,
} from '../../public/platform-proof-verifier.js';
import { KeyIdentifier } from '../../domain/user/key-identifier.js';
import type { RequestProofVerifier } from '../ports/request-proof-verifier.js';
import type { UserRepository } from '../ports/user-repository.js';

export interface VerifyPlatformProofDeps {
  readonly users: UserRepository;
  readonly proofs: RequestProofVerifier;
}

/**
 * Implements the PlatformProofVerifier open host service (FR-QR-10). The proof must be made with
 * the session's own device key, and that key must still be active: a token issued before the key
 * was revoked stays usable until it expires, but earns no reward (SDD 7.1, FR-AUTH-07).
 */
export class VerifyPlatformProof implements PlatformProofVerifier {
  constructor(private readonly deps: VerifyPlatformProofDeps) {}

  async verify(request: PlatformProofRequest): Promise<'valid' | 'invalid'> {
    const keyIdentifier = KeyIdentifier.parse(request.keyIdentifier);
    if (request.proof === undefined || !keyIdentifier.ok) return 'invalid';
    const user = await this.deps.users.findById(request.userId);
    const key = user?.deviceKey(keyIdentifier.value);
    if (key?.status !== 'active') return 'invalid';
    const valid = await this.deps.proofs.verify({
      publicKey: key.publicKey,
      idempotencyKey: request.idempotencyKey,
      body: request.body,
      proof: request.proof,
    });
    return valid ? 'valid' : 'invalid';
  }
}
