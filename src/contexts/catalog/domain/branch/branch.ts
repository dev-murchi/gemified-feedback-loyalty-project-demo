import { AggregateRoot } from '../../../../shared-kernel/aggregate-root.js';
import type { Clock } from '../../../../shared-kernel/clock.js';
import type { IdGenerator } from '../../../../shared-kernel/id-generator.js';
import type { BranchId, BrandId } from '../../../../shared-kernel/ids.js';
import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { GeoPoint } from '../geo-point.js';
import type { InvalidBranch, QrCodeNotFound } from './branch-errors.js';
import { QrCodeId, type QrCode } from './qr-code.js';
import { QrToken } from './qr-token.js';

export interface NewBranch {
  readonly id: BranchId;
  readonly brandId: BrandId;
  readonly name: string;
  readonly location: GeoPoint;
}

export interface BranchState extends NewBranch {
  readonly qrCodes: readonly QrCode[];
}

/** What issuing a QR code needs: randomness for the token, an id and the time. */
export interface QrIssuing {
  readonly random: RandomSource;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** What a revocation did; either way the caller gets ok (revoking twice is not an error). */
export type RevokeOutcome = 'revoked' | 'already_revoked';

/** QR codes hold Dates, which are mutable; copies keep callers from changing branch state. */
const copyQrCode = (code: QrCode): QrCode => ({
  ...code,
  createdAt: new Date(code.createdAt),
  revokedAt: code.revokedAt === null ? null : new Date(code.revokedAt),
});

/** A physical location of a brand and its QR codes (docs/06 §5.2). */
export class Branch extends AggregateRoot {
  #state: BranchState;

  private constructor(state: BranchState, version: number) {
    super(version);
    this.#state = {
      ...state,
      location: { ...state.location },
      qrCodes: state.qrCodes.map(copyQrCode),
    };
  }

  static create(branch: NewBranch): Result<Branch, InvalidBranch> {
    const name = branch.name.trim();
    return name === ''
      ? err({ code: 'VALIDATION_ERROR', field: 'name' })
      : ok(new Branch({ ...branch, name, qrCodes: [] }, 0));
  }

  /** Restores stored state (repository or demo snapshot); version 0 means never stored. */
  static reconstitute(state: BranchState, version: number): Branch {
    return new Branch(state, version);
  }

  get id(): BranchId {
    return this.#state.id;
  }

  get brandId(): BrandId {
    return this.#state.brandId;
  }

  get name(): string {
    return this.#state.name;
  }

  get location(): GeoPoint {
    return { ...this.#state.location };
  }

  get qrCodes(): readonly QrCode[] {
    return this.#state.qrCodes.map(copyQrCode);
  }

  /** FR-QR-01: issues a new QR code; its token is always freshly generated. */
  issueQrCode(issuing: QrIssuing): QrCode {
    const code: QrCode = {
      id: QrCodeId.generate(issuing.ids),
      token: QrToken.generate(issuing.random),
      status: 'active',
      createdAt: issuing.clock.now(),
      revokedAt: null,
    };
    this.#state = { ...this.#state, qrCodes: [...this.#state.qrCodes, code] };
    return copyQrCode(code);
  }

  /**
   * FR-QR-01: a revoked code is never activated again; a replacement is issued with
   * `issueQrCode`. Revoking an already revoked code changes nothing and says so, so the caller
   * can skip saving.
   */
  revokeQrCode(
    token: QrToken,
    now: Date,
  ): Result<RevokeOutcome, QrCodeNotFound> {
    const code = this.#state.qrCodes.find(
      (candidate) => candidate.token === token,
    );
    if (code === undefined) return err({ code: 'NOT_FOUND' });
    if (code.status === 'revoked') return ok('already_revoked');
    this.#replace({ ...code, status: 'revoked', revokedAt: new Date(now) });
    return ok('revoked');
  }

  /** FR-QR-02: only an active code of this branch is accepted. */
  accepts(token: QrToken): boolean {
    return this.activeQrCode(token) !== undefined;
  }

  /** The active code with this token, or undefined if the token is unknown here or revoked. */
  activeQrCode(token: QrToken): QrCode | undefined {
    const code = this.#state.qrCodes.find(
      (candidate) => candidate.token === token && candidate.status === 'active',
    );
    return code === undefined ? undefined : copyQrCode(code);
  }

  #replace(updated: QrCode): void {
    const qrCodes = this.#state.qrCodes.map((code) =>
      code.id === updated.id ? updated : code,
    );
    this.#state = { ...this.#state, qrCodes };
  }
}
