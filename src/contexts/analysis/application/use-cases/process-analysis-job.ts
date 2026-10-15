import type { Clock } from '../../../../shared-kernel/clock.js';
import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import { retryOnConflict } from '../../../../shared-kernel/retry-on-conflict.js';
import type { UnitOfWork } from '../../../../shared-kernel/unit-of-work.js';
import {
  isCatalogSector,
  type CatalogSector,
} from '../../../catalog/public/catalog-sector.js';
import type { LabelSetProvider } from '../../../catalog/public/label-set-provider.js';
import type { RawTextSource } from '../../../feedback/public/raw-text-source.js';
import type {
  AnalysisResult,
  FailureKind,
} from '../../domain/feedback-analysis/analysis-result.js';
import { FeedbackAnalysis } from '../../domain/feedback-analysis/feedback-analysis.js';
import { parseLlmOutput } from '../../domain/feedback-analysis/llm-output.js';
import type { MaskedText } from '../../domain/masking/masked-text.js';
import type { PiiMasker } from '../../domain/masking/pii-masker.js';
import type { PreChecks } from '../../domain/pre-check/pre-checks.js';
import type { RetryPolicy } from '../../domain/retry/retry-policy.js';
import type { SentimentAnalyzer } from '../ports/sentiment-analyzer.js';
import type { FeedbackAnalysisRepository } from '../ports/feedback-analysis-repository.js';

export interface ProcessAnalysisJobDeps {
  readonly analyses: FeedbackAnalysisRepository;
  readonly rawTexts: RawTextSource;
  readonly labelSets: LabelSetProvider;
  readonly analyzer: SentimentAnalyzer;
  readonly preChecks: PreChecks;
  readonly masker: PiiMasker;
  readonly retries: RetryPolicy;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

/** The FeedbackSubmitted payload as the queue delivers it (S0-10). */
export interface ProcessAnalysisJobCommand {
  readonly feedbackId: FeedbackId;
  readonly sector: string;
  readonly submittedAt: Date;
}

/**
 * `analyzed`: the result is stored and announced. `skipped`: nothing to do (closed, unknown or
 * already analyzed), no LLM call. `retry`: run the job again at `at`. `deadline_passed`: no time is
 * left; the 24-hour close takes over (FR-AI-09).
 */
export type JobOutcome =
  | { readonly outcome: 'analyzed' }
  | { readonly outcome: 'skipped' }
  | { readonly outcome: 'retry'; readonly at: Date }
  | { readonly outcome: 'deadline_passed' };

/** What the attempt found, decided before the transaction. */
type Attempt =
  | { readonly kind: 'result'; readonly result: AnalysisResult }
  | {
      readonly kind: 'failure';
      readonly failure: FailureKind;
      readonly maskedText: MaskedText;
    };

const SKIPPED: JobOutcome = { outcome: 'skipped' };

/**
 * One analysis attempt (docs/06 §5.4): pre-checks → masking → LLM call outside the transaction →
 * schema and label-set check → in one unit of work, the result and FeedbackAnalyzed (Feedback and
 * Gamification react in it, ADR-014) or the failure and the next attempt time. Nothing is attempted
 * after submittedAt + 24 h, and a feedback no longer analyzing costs no LLM call.
 */
export class ProcessAnalysisJob {
  constructor(private readonly deps: ProcessAnalysisJobDeps) {}

  async execute(cmd: ProcessAnalysisJobCommand): Promise<JobOutcome> {
    const now = this.deps.clock.now();
    if (!this.deps.retries.allowsAttemptAt(now, cmd.submittedAt))
      return { outcome: 'deadline_passed' };
    const lookup = await this.deps.rawTexts.rawTextFor(cmd.feedbackId);
    // A stored result always closed the feedback in the same transaction, so this also skips a
    // duplicate job; the check inside the transaction covers two jobs racing.
    if (lookup.state !== 'analyzing') return SKIPPED;
    const attempt = await this.#attempt(cmd, lookup.text);
    return retryOnConflict(() =>
      this.deps.uow.run(() => this.#record(cmd, attempt)),
    );
  }

  async #attempt(
    cmd: ProcessAnalysisJobCommand,
    text: string,
  ): Promise<Attempt> {
    const maskedText = this.deps.masker.mask(text);
    if (this.deps.preChecks.check(text).outcome === 'gibberish')
      return {
        kind: 'result',
        result: {
          source: 'pre_check',
          spamReason: 'gibberish',
          maskedText,
          analyzedAt: this.deps.clock.now(),
        },
      };
    return this.#askModel(sectorOf(cmd.sector), maskedText);
  }

  /** The only outside call, made before any transaction (docs/07 §5). */
  async #askModel(
    sector: CatalogSector,
    maskedText: MaskedText,
  ): Promise<Attempt> {
    const labelSet = await this.deps.labelSets.current(sector);
    const response = await this.deps.analyzer.analyze({
      maskedText,
      topics: labelSet.topics,
    });
    if (response.outcome === 'unavailable')
      return { kind: 'failure', failure: 'provider_unavailable', maskedText };
    const verdict = parseLlmOutput(
      response.output,
      labelSet.topics.map((topic) => topic.key),
    );
    if (verdict === undefined)
      return { kind: 'failure', failure: 'invalid_response', maskedText };
    return {
      kind: 'result',
      result: {
        source: 'llm',
        verdict,
        provenance: {
          model: response.model,
          promptVersion: response.promptVersion,
          labelSetVersion: labelSet.version,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        maskedText,
        analyzedAt: this.deps.clock.now(),
      },
    };
  }

  /** Inside the unit of work: reloads, so a concurrent job's result is never overwritten. */
  async #record(
    cmd: ProcessAnalysisJobCommand,
    attempt: Attempt,
  ): Promise<JobOutcome> {
    const analysis =
      (await this.deps.analyses.find(cmd.feedbackId)) ??
      FeedbackAnalysis.start(cmd.feedbackId, cmd.submittedAt);
    if (analysis.isCompleted) return SKIPPED;
    const outcome = this.#apply(analysis, attempt);
    await this.deps.analyses.save(analysis);
    return outcome;
  }

  #apply(analysis: FeedbackAnalysis, attempt: Attempt): JobOutcome {
    if (attempt.kind === 'result') {
      analysis.complete(attempt.result);
      return { outcome: 'analyzed' };
    }
    const decision = analysis.recordFailure(
      {
        kind: attempt.failure,
        at: this.deps.clock.now(),
        maskedText: attempt.maskedText,
      },
      this.deps.retries,
    );
    return decision.next === 'retry'
      ? { outcome: 'retry', at: decision.retryAt }
      : { outcome: 'deadline_passed' };
  }
}

/** The sector arrives from the queue as a plain string; anything else is a wiring error. */
function sectorOf(sector: string): CatalogSector {
  if (!isCatalogSector(sector)) throw new Error(`Unknown sector "${sector}"`);
  return sector;
}
