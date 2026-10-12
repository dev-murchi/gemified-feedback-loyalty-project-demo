import type { Clock } from '../../../../shared-kernel/clock.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import { retryOnConflict } from '../../../../shared-kernel/retry-on-conflict.js';
import type { UnitOfWork } from '../../../../shared-kernel/unit-of-work.js';
import type { QrCodeNotFound } from '../../domain/branch/branch-errors.js';
import { QrToken, type QrInvalid } from '../../domain/branch/qr-token.js';
import type { BranchRepository } from '../ports/branch-repository.js';

export interface RevokeQrCodeDeps {
  readonly branches: BranchRepository;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface RevokeQrCodeCommand {
  readonly token: string;
}

export type RevokeQrCodeError = QrInvalid | QrCodeNotFound;

/**
 * Admin (V-4): revokes a QR code, e.g. one that has spread; a replacement is issued separately.
 * Revoking an already revoked code is ok and stores nothing.
 */
export class RevokeQrCode {
  constructor(private readonly deps: RevokeQrCodeDeps) {}

  async execute(
    command: RevokeQrCodeCommand,
  ): Promise<Result<void, RevokeQrCodeError>> {
    const token = QrToken.parse(command.token);
    if (!token.ok) return token;
    return retryOnConflict(() =>
      this.deps.uow.run(() => this.#revoke(token.value)),
    );
  }

  /** Load, decide, then save (docs/07 §5: every decision before the first save). */
  async #revoke(token: QrToken): Promise<Result<void, QrCodeNotFound>> {
    const branch = await this.deps.branches.findByQrToken(token);
    if (branch === undefined) return err({ code: 'NOT_FOUND' });
    const revoked = branch.revokeQrCode(token, this.deps.clock.now());
    if (!revoked.ok) return revoked;
    if (revoked.value === 'revoked') await this.deps.branches.save(branch);
    return ok(undefined);
  }
}
