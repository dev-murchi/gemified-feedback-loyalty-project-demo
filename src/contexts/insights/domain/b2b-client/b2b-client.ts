import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type { BrandId } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { Scope } from '../scope.js';
import type { TokenRejection } from './token-errors.js';

export interface B2bClientState {
  /** The OAuth2 `client_id`, e.g. `brand-a-panel`. */
  readonly clientId: string;
  readonly brandId: BrandId;
  /** The stored hash of the secret; the secret itself is never kept (SDD 7.3). */
  readonly secretHash: string;
  readonly scopes: readonly Scope[];
  /** After this time the client can no longer get a token; null for no expiry. */
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

const copyDate = (date: Date | null): Date | null =>
  date === null ? null : new Date(date);

/**
 * A brand's API client (docs/06 §5.6, FR-B2B-01). A brand may have several, so a key can be rotated
 * without downtime: a new client is created and the old one revoked. A revoked or expired client
 * gets no token (TC-B2B-05), and a token never carries a scope the client does not have.
 */
export class B2bClient extends AggregateRoot {
  #state: B2bClientState;

  private constructor(state: B2bClientState, version: number) {
    super(version);
    this.#state = {
      ...state,
      scopes: [...state.scopes],
      expiresAt: copyDate(state.expiresAt),
      revokedAt: copyDate(state.revokedAt),
    };
  }

  /** A new, active client; version 0 means never stored. */
  static create(state: Omit<B2bClientState, 'revokedAt'>): B2bClient {
    return new B2bClient({ ...state, revokedAt: null }, 0);
  }

  static reconstitute(state: B2bClientState, version: number): B2bClient {
    return new B2bClient(state, version);
  }

  get state(): B2bClientState {
    return {
      ...this.#state,
      scopes: [...this.#state.scopes],
      expiresAt: copyDate(this.#state.expiresAt),
      revokedAt: copyDate(this.#state.revokedAt),
    };
  }

  get clientId(): string {
    return this.#state.clientId;
  }

  get brandId(): BrandId {
    return this.#state.brandId;
  }

  get secretHash(): string {
    return this.#state.secretHash;
  }

  isActiveAt(now: Date): boolean {
    const { revokedAt, expiresAt } = this.#state;
    return revokedAt === null && (expiresAt === null || now < expiresAt);
  }

  /**
   * The scopes of a token for this request: all the client's scopes when none were asked for
   * (an absent or empty `scope`), otherwise the asked ones if the client has every one of them.
   */
  grant(
    requested: readonly Scope[],
    now: Date,
  ): Result<Scope[], TokenRejection> {
    if (!this.isActiveAt(now)) return err({ error: 'invalid_client' });
    if (requested.length === 0) return ok([...this.#state.scopes]);
    const allowed = requested.every((scope) =>
      this.#state.scopes.includes(scope),
    );
    return allowed ? ok([...requested]) : err({ error: 'invalid_scope' });
  }

  /** Revoking twice keeps the first time (FR-B2B-01 rotation). */
  revoke(now: Date): void {
    if (this.#state.revokedAt !== null) return;
    this.#state = { ...this.#state, revokedAt: new Date(now) };
  }
}
