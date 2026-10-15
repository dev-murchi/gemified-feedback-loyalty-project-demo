import type { FeedbackId } from '../../../../shared-kernel/ids.js';
import type {
  RawTextLookup,
  RawTextSource,
} from '../../public/raw-text-source.js';
import type { FeedbackRepository } from '../ports/feedback-repository.js';
import type { RawTextCipher } from '../ports/raw-text-cipher.js';

export interface ReadRawTextDeps {
  readonly feedbacks: FeedbackRepository;
  readonly cipher: RawTextCipher;
}

const NOT_ANALYZING: RawTextLookup = { state: 'not_analyzing' };

/** Implements the RawTextSource open host service. Read-only; decrypts only while analyzing. */
export class ReadRawText implements RawTextSource {
  constructor(private readonly deps: ReadRawTextDeps) {}

  async rawTextFor(feedbackId: FeedbackId): Promise<RawTextLookup> {
    const feedback = await this.deps.feedbacks.find(feedbackId);
    const rawText = feedback?.rawText;
    if (feedback?.status !== 'analyzing' || rawText == null)
      return NOT_ANALYZING;
    const text = await this.deps.cipher.decrypt(feedbackId, rawText);
    return { state: 'analyzing', text };
  }
}
