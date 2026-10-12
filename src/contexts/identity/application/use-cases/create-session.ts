import type { Clock } from '../../../../shared-kernel/clock.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { SignatureInvalid } from '../../domain/attestation-errors.js';
import type { ChallengeInvalid, Nonce } from '../../domain/challenge/nonce.js';
import {
  KeyIdentifier,
  type InvalidKeyIdentifier,
} from '../../domain/user/key-identifier.js';
import type { Platform } from '../../domain/user/platform.js';
import type { KeyRevoked } from '../../domain/user/user-errors.js';
import type { User } from '../../domain/user/user.js';
import type { AccessTokenIssuer } from '../ports/access-token-issuer.js';
import type { ChallengeStore } from '../ports/challenge-store.js';
import type { SessionProofVerifier } from '../ports/session-proof-verifier.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SessionGrant } from '../session-grant.js';
import { takeLiveNonce } from '../take-live-nonce.js';

export interface CreateSessionDeps {
  readonly challenges: ChallengeStore;
  readonly users: UserRepository;
  readonly proofs: SessionProofVerifier;
  readonly tokens: AccessTokenIssuer;
  readonly clock: Clock;
}

export interface CreateSessionCommand {
  readonly platform: Platform;
  readonly keyId: string;
  readonly nonce: string;
  /** The `assertion` (iOS) or `signature` (Android) field, as received. */
  readonly proof: string;
}

export type CreateSessionError =
  InvalidKeyIdentifier | ChallengeInvalid | SignatureInvalid | KeyRevoked;

/**
 * `POST /v1/auth/session` (FR-AUTH-03, TC-AUTH-06). The device proves it holds a registered key by
 * signing a fresh challenge; the answer is a token of at most 15 minutes. Nothing is written, so
 * there is no unit of work. An unknown key answers like a wrong signature, and a revoked key is
 * reported only after the signature verified, so a stranger learns nothing about keys.
 */
export class CreateSession {
  constructor(private readonly deps: CreateSessionDeps) {}

  async execute(
    cmd: CreateSessionCommand,
  ): Promise<Result<SessionGrant, CreateSessionError>> {
    const keyIdentifier = KeyIdentifier.parse(cmd.keyId);
    if (!keyIdentifier.ok) return keyIdentifier;
    const nonce = await takeLiveNonce(this.deps, cmd.nonce);
    if (!nonce.ok) return nonce;
    const user = await this.deps.users.findByKeyIdentifier(keyIdentifier.value);
    const proven = await this.#proveKey(user, keyIdentifier.value, {
      platform: cmd.platform,
      nonce: nonce.value,
      proof: cmd.proof,
    });
    return proven.ok ? this.#grant(proven.value, keyIdentifier.value) : proven;
  }

  /** A key that is not on file for this platform fails like a bad signature (no key probing). */
  async #proveKey(
    user: User | undefined,
    keyIdentifier: KeyIdentifier,
    claim: { platform: Platform; nonce: Nonce; proof: string },
  ): Promise<Result<User, SignatureInvalid | KeyRevoked>> {
    const key = user?.deviceKey(keyIdentifier);
    if (user === undefined || key?.platform !== claim.platform)
      return err({ code: 'SIGNATURE_INVALID' });
    const verdict = await this.deps.proofs.verify({
      nonce: claim.nonce,
      publicKey: key.publicKey,
      proof: claim.proof,
    });
    if (!verdict.ok) return verdict;
    const usable = user.checkKeyUsable(keyIdentifier);
    return usable.ok ? ok(user) : usable;
  }

  async #grant(
    user: User,
    keyIdentifier: KeyIdentifier,
  ): Promise<Result<SessionGrant, never>> {
    const token = await this.deps.tokens.issue({
      userId: user.id,
      keyIdentifier,
      trustLevel: user.trustLevel,
    });
    return ok({ userId: user.id, trustLevel: user.trustLevel, ...token });
  }
}
