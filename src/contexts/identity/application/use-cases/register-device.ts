import type { Clock } from '../../../../shared-kernel/clock.js';
import type { IdGenerator } from '../../../../shared-kernel/id-generator.js';
import type { UserId } from '../../../../shared-kernel/ids.js';
import { ok, type Result } from '../../../../shared-kernel/result.js';
import { retryOnConflict } from '../../../../shared-kernel/retry-on-conflict.js';
import type { UnitOfWork } from '../../../../shared-kernel/unit-of-work.js';
import type { ChallengeInvalid } from '../../domain/challenge/nonce.js';
import type { KeyIdentifier } from '../../domain/user/key-identifier.js';
import type { TrustLevel } from '../../domain/user/trust-level.js';
import type { KeyRevoked } from '../../domain/user/user-errors.js';
import { User, type AttestedDeviceKey } from '../../domain/user/user.js';
import type {
  AttestationEvidence,
  AttestationRejection,
  AttestationVerifier,
} from '../ports/attestation-verifier.js';
import type { AccessTokenIssuer } from '../ports/access-token-issuer.js';
import type { ChallengeStore } from '../ports/challenge-store.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { SessionGrant } from '../session-grant.js';
import { takeLiveNonce } from '../take-live-nonce.js';

export interface RegisterDeviceDeps {
  readonly challenges: ChallengeStore;
  readonly attestation: AttestationVerifier;
  readonly users: UserRepository;
  readonly tokens: AccessTokenIssuer;
  readonly uow: UnitOfWork;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface RegisterDeviceCommand {
  readonly nonce: string;
  readonly evidence: AttestationEvidence;
}

export interface RegisterDeviceResult extends SessionGrant {
  /** True: a new user (and wallet) was created, API 201. False: the key was known, API 200. */
  readonly created: boolean;
}

/** What the transaction decided, before the token is minted. */
interface Registered {
  readonly userId: UserId;
  readonly trustLevel: TrustLevel;
  readonly created: boolean;
}

export type RegisterDeviceError =
  ChallengeInvalid | AttestationRejection | KeyRevoked;

/**
 * `POST /v1/auth/register` (FR-AUTH-01, FR-AUTH-02, TC-AUTH-01/02/04). The nonce is taken first and
 * stays used whatever happens next (T-S4), the platform is asked outside the transaction, and the
 * same device registering again gets its existing user. The wallet opens in the same unit of work
 * through `UserRegistered` (docs/06 §7).
 */
export class RegisterDevice {
  constructor(private readonly deps: RegisterDeviceDeps) {}

  async execute(
    cmd: RegisterDeviceCommand,
  ): Promise<Result<RegisterDeviceResult, RegisterDeviceError>> {
    const nonce = await takeLiveNonce(this.deps, cmd.nonce);
    if (!nonce.ok) return nonce;
    const key = await this.deps.attestation.verify({
      nonce: nonce.value,
      evidence: cmd.evidence,
    });
    if (!key.ok) return key;
    const registered = await retryOnConflict(() =>
      this.deps.uow.run(() => this.#registerOrFind(key.value)),
    );
    return registered.ok
      ? this.#grant(registered.value, key.value.keyIdentifier)
      : registered;
  }

  /** The token is minted after the transaction: it needs no storage and may be lost safely. */
  async #grant(
    registered: Registered,
    keyIdentifier: KeyIdentifier,
  ): Promise<Result<RegisterDeviceResult, never>> {
    const token = await this.deps.tokens.issue({
      userId: registered.userId,
      keyIdentifier,
      trustLevel: registered.trustLevel,
    });
    return ok({ ...registered, ...token });
  }

  /**
   * The device already proved it holds the key. A known key gives its existing user, unless the key
   * was revoked (FR-AUTH-07); that is decided before anything is saved.
   */
  async #registerOrFind(
    key: AttestedDeviceKey,
  ): Promise<Result<Registered, KeyRevoked>> {
    const existing = await this.deps.users.findByKeyIdentifier(
      key.keyIdentifier,
    );
    if (existing !== undefined) return this.#existing(existing, key);
    const user = User.register(key, {
      ids: this.deps.ids,
      clock: this.deps.clock,
    });
    await this.deps.users.save(user);
    return ok({
      userId: user.id,
      trustLevel: user.trustLevel,
      created: true,
    });
  }

  #existing(
    user: User,
    key: AttestedDeviceKey,
  ): Result<Registered, KeyRevoked> {
    const usable = user.checkKeyUsable(key.keyIdentifier);
    return usable.ok
      ? ok({ userId: user.id, trustLevel: user.trustLevel, created: false })
      : usable;
  }
}
