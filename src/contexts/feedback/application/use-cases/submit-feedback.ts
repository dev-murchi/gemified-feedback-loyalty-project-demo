import type { Clock } from '../../../../shared-kernel/clock.js';
import type { IdGenerator } from '../../../../shared-kernel/id-generator.js';
import type { Logger } from '../../../../shared-kernel/logger.js';
import { FeedbackId, type UserId } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import { retryOnConflict } from '../../../../shared-kernel/retry-on-conflict.js';
import type { UnitOfWork } from '../../../../shared-kernel/unit-of-work.js';
import type {
  QrInvalidError,
  QrResolver,
  ResolvedQr,
} from '../../../catalog/public/qr-resolver.js';
import type { PlatformProofVerifier } from '../../../identity/public/platform-proof-verifier.js';
import { Feedback } from '../../domain/feedback/feedback.js';
import type { EncryptedRawText } from '../../domain/feedback/raw-text.js';
import {
  FeedbackText,
  type InvalidFeedbackText,
} from '../../domain/feedback-text.js';
import {
  IdempotencyKey,
  type IdempotencyKeyMismatch,
  type InvalidIdempotencyKey,
} from '../../domain/idempotency-key.js';
import { RequestFingerprint } from '../../domain/request-fingerprint.js';
import { RewardCooldown } from '../../domain/reward-cooldown/reward-cooldown.js';
import type { RewardLimits } from '../../domain/reward-cooldown/reward-limits.js';
import type { RewardRejection } from '../../domain/reward-cooldown/rewarding-errors.js';
import type { FeedbackRepository } from '../ports/feedback-repository.js';
import type { Hasher } from '../ports/hasher.js';
import type { RawTextCipher } from '../ports/raw-text-cipher.js';
import type { RewardCooldownRepository } from '../ports/reward-cooldown-repository.js';

export interface SubmitFeedbackDeps {
  readonly feedbacks: FeedbackRepository;
  readonly cooldowns: RewardCooldownRepository;
  readonly limits: RewardLimits;
  readonly qrCodes: QrResolver;
  readonly proofs: PlatformProofVerifier;
  readonly cipher: RawTextCipher;
  readonly hasher: Hasher;
  readonly uow: UnitOfWork;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** POST /v1/feedbacks as the inbound adapter hands it over, with the caller from the token. */
export interface SubmitFeedbackCommand {
  readonly userId: UserId;
  readonly keyIdentifier: string;
  readonly trustLevel: 'normal' | 'low';
  readonly idempotencyKey: string;
  readonly qrToken: string;
  readonly text: string;
  /** The body exactly as received: the fingerprint and the platform proof are taken over it. */
  readonly body: Uint8Array;
  readonly platformProof: string | undefined;
  readonly correlationId: string;
}

/** The 202 body (`FeedbackAccepted`); `replayed` is the `Idempotent-Replayed` header. */
export interface SubmitFeedbackResult {
  readonly feedbackId: FeedbackId;
  readonly status: 'analyzing';
  readonly submittedAt: Date;
  readonly rewardEligible: boolean;
  readonly replayed: boolean;
}

export type SubmitFeedbackError =
  | InvalidIdempotencyKey
  | IdempotencyKeyMismatch
  | InvalidFeedbackText
  | QrInvalidError
  | RewardRejection;

type Submitted = Result<SubmitFeedbackResult, SubmitFeedbackError>;

/** Everything decided before the transaction: no outside call happens inside it (docs/07 §5). */
interface Prepared {
  readonly userId: UserId;
  readonly key: IdempotencyKey;
  readonly fingerprint: RequestFingerprint;
  readonly id: FeedbackId;
  readonly qr: ResolvedQr;
  readonly rawText: EncryptedRawText;
  readonly rewardEligible: boolean;
  readonly correlationId: string;
}

const accepted = (feedback: Feedback, replayed: boolean): Submitted =>
  ok({
    feedbackId: feedback.id,
    status: 'analyzing',
    submittedAt: feedback.submittedAt,
    rewardEligible: feedback.rewardEligible,
    replayed,
  });

/**
 * POST /v1/feedbacks (US-02). A repeated request (same key, same body) gets the first answer, even
 * if its QR code was revoked since (FR-AI-10). The QR code, the platform proof and the encryption
 * are dealt with before the transaction; inside it the reward rules decide (RewardCooldown), and
 * the feedback, its raw text, the cooldown and FeedbackSubmitted are written together (docs/06 §7).
 * A concurrent request reloads and decides again (ADR-019, TC-QR-01).
 */
export class SubmitFeedback {
  constructor(private readonly deps: SubmitFeedbackDeps) {}

  async execute(cmd: SubmitFeedbackCommand): Promise<Submitted> {
    const key = IdempotencyKey.parse(cmd.idempotencyKey);
    if (!key.ok) return key;
    const fingerprint = this.#fingerprintOf(cmd.body);
    const replay = await this.#replay(cmd.userId, key.value, fingerprint);
    if (replay !== undefined) return replay;
    const prepared = await this.#prepare(cmd, key.value, fingerprint);
    if (!prepared.ok) return prepared;
    return retryOnConflict(() =>
      this.deps.uow.run(() => this.#accept(prepared.value)),
    );
  }

  #fingerprintOf(body: Uint8Array): RequestFingerprint {
    const hex = this.deps.hasher.sha256Hex(body);
    const fingerprint = RequestFingerprint.parse(hex);
    if (!fingerprint.ok) throw new Error('Hasher returned no SHA-256 hex');
    return fingerprint.value;
  }

  /** The first answer for a repeated request; undefined when the key is new for this user. */
  async #replay(
    userId: UserId,
    key: IdempotencyKey,
    fingerprint: RequestFingerprint,
  ): Promise<Submitted | undefined> {
    const existing = await this.deps.feedbacks.findByIdempotencyKey(
      userId,
      key,
    );
    if (existing === undefined) return undefined;
    return existing.requestFingerprint === fingerprint
      ? accepted(existing, true)
      : err({ code: 'IDEMPOTENCY_KEY_MISMATCH' });
  }

  async #prepare(
    cmd: SubmitFeedbackCommand,
    key: IdempotencyKey,
    fingerprint: RequestFingerprint,
  ): Promise<Result<Prepared, InvalidFeedbackText | QrInvalidError>> {
    const text = FeedbackText.create(cmd.text);
    if (!text.ok) return text;
    const qr = await this.deps.qrCodes.resolve(cmd.qrToken);
    if (!qr.ok) {
      // TC-QR-07: rejected tokens are logged to spot guessing; the token itself is not.
      this.deps.logger.warn('Feedback with an invalid QR token rejected', {
        userId: cmd.userId,
        requestId: cmd.correlationId,
      });
      return qr;
    }
    const proof = await this.deps.proofs.verify({
      userId: cmd.userId,
      keyIdentifier: cmd.keyIdentifier,
      idempotencyKey: cmd.idempotencyKey,
      body: cmd.body,
      proof: cmd.platformProof,
    });
    const id = FeedbackId.generate(this.deps.ids);
    return ok({
      userId: cmd.userId,
      key,
      fingerprint,
      id,
      qr: qr.value,
      rawText: await this.deps.cipher.encrypt(id, text.value),
      rewardEligible: cmd.trustLevel === 'normal' && proof === 'valid',
      correlationId: cmd.correlationId,
    });
  }

  /**
   * Inside the unit of work; every decision comes before the first save (docs/07 §5). The replay
   * is asked again: a concurrent request with the same key may have committed meanwhile.
   */
  async #accept(prepared: Prepared): Promise<Submitted> {
    const replay = await this.#replay(
      prepared.userId,
      prepared.key,
      prepared.fingerprint,
    );
    if (replay !== undefined) return replay;
    const now = this.deps.clock.now();
    const cooldown = await this.#cooldownOf(prepared);
    const reserved = cooldown.reserve(prepared.id, now);
    if (!reserved.ok) return reserved;
    const feedback = Feedback.submit({
      id: prepared.id,
      userId: prepared.userId,
      branchId: prepared.qr.branchId,
      qrCodeId: prepared.qr.qrCodeId,
      sector: prepared.qr.sector,
      idempotencyKey: prepared.key,
      requestFingerprint: prepared.fingerprint,
      rewardEligible: prepared.rewardEligible,
      correlationId: prepared.correlationId,
      submittedAt: now,
      rawText: prepared.rawText,
    });
    await this.deps.feedbacks.save(feedback);
    await this.deps.cooldowns.save(cooldown);
    return accepted(feedback, false);
  }

  async #cooldownOf(prepared: Prepared): Promise<RewardCooldown> {
    const { userId } = prepared;
    const { branchId } = prepared.qr;
    const stored = await this.deps.cooldowns.find(userId, branchId);
    return (
      stored ?? RewardCooldown.open({ userId, branchId }, this.deps.limits)
    );
  }
}
