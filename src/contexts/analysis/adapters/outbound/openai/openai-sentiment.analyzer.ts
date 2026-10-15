import type { Logger } from '../../../../../shared-kernel/logger.js';
import type {
  AnalyzerRequest,
  AnalyzerResponse,
  SentimentAnalyzer,
} from '../../../application/ports/sentiment-analyzer.js';
import {
  outputSchema,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  userMessage,
} from '../prompts/feedback-analysis-v1.js';
import type { OpenAiConfig } from './openai-config.js';

export interface OpenAiSentimentAnalyzerDeps {
  readonly config: OpenAiConfig;
  readonly logger: Logger;
}

/** The parts of a Chat Completions response this adapter reads. */
interface Completion {
  readonly model?: unknown;
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: unknown;
      readonly refusal?: unknown;
    };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
  };
}

const UNAVAILABLE: AnalyzerResponse = { outcome: 'unavailable' };

/** The provider is busy, overloaded or broken: worth trying again later. */
const isTransient = (status: number): boolean =>
  status === 408 || status === 409 || status === 429 || status >= 500;

const numberOr0 = (value: unknown): number =>
  typeof value === 'number' ? value : 0;

/** The model's JSON answer, or null when it refused or wrote something that is not JSON. */
function outputOf(completion: Completion): unknown {
  const message = completion.choices?.[0]?.message;
  if (typeof message?.content !== 'string') return null;
  try {
    return JSON.parse(message.content) as unknown;
  } catch {
    return null;
  }
}

/**
 * OpenAI behind the SentimentAnalyzer port (FR-AI-06, ADR-018): Chat Completions with a strict JSON
 * schema, plain `fetch`, no SDK. Network errors, timeouts (also while reading the body), 408/409/429,
 * 5xx and an unreadable 200 body are `unavailable`
 * (retried, FR-AI-05). Any other error status (bad key, bad model, bad request) is a configuration
 * fault: it throws, so it is never mistaken for an outage that could earn a 24-hour reward.
 * Request and response bodies are never logged: they carry the comment (TC-AI-07, T-I4).
 */
export class OpenAiSentimentAnalyzer implements SentimentAnalyzer {
  constructor(private readonly deps: OpenAiSentimentAnalyzerDeps) {}

  async analyze(request: AnalyzerRequest): Promise<AnalyzerResponse> {
    const response = await this.#post(request);
    if (response === undefined) return UNAVAILABLE;
    if (!response.ok) return this.#failed(response.status);
    const completion = await this.#read(response);
    if (completion === undefined) return UNAVAILABLE;
    return {
      outcome: 'answered',
      output: outputOf(completion),
      model:
        typeof completion.model === 'string'
          ? completion.model
          : this.deps.config.model,
      promptVersion: PROMPT_VERSION,
      inputTokens: numberOr0(completion.usage?.prompt_tokens),
      outputTokens: numberOr0(completion.usage?.completion_tokens),
    };
  }

  /** The HTTP response, or undefined when the provider could not be reached in time. */
  async #post(request: AnalyzerRequest): Promise<Response | undefined> {
    const { config } = this.deps;
    try {
      return await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.#body(request)),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      this.deps.logger.warn('LLM provider unreachable', {
        model: config.model,
        error: error instanceof Error ? error.name : 'unknown',
      });
      return undefined;
    }
  }

  /**
   * The body of a 200 response, or undefined when it cannot be read in time or is not JSON. The
   * timeout also covers reading the body; an unparseable 200 body (a proxy or gateway page) comes
   * from the infrastructure, not from the comment, so it is an outage too.
   */
  async #read(response: Response): Promise<Completion | undefined> {
    try {
      return (await response.json()) as Completion;
    } catch (error) {
      this.deps.logger.warn('LLM provider answer unreadable', {
        status: response.status,
        model: this.deps.config.model,
        error: error instanceof Error ? error.name : 'unknown',
      });
      return undefined;
    }
  }

  #body(request: AnalyzerRequest) {
    return {
      model: this.deps.config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage(request) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'feedback_analysis',
          strict: true,
          schema: outputSchema(request.topics.map((topic) => topic.key)),
        },
      },
    };
  }

  #failed(status: number): AnalyzerResponse {
    const { model } = this.deps.config;
    if (isTransient(status)) {
      this.deps.logger.warn('LLM provider unavailable', { status, model });
      return UNAVAILABLE;
    }
    throw new Error(`LLM provider rejected the request with HTTP ${status}`);
  }
}
