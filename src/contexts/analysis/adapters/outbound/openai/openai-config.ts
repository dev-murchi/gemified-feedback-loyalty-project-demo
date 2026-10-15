/** OPENAI_API_KEY, OPENAI_MODEL and, for tests or a proxy, OPENAI_BASE_URL. */
export interface OpenAiConfig {
  readonly apiKey: string;
  /** Chosen by measurement in S0-13 (ADR-018); configuration, never code. */
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_TIMEOUT_MS = 20_000;

/** Reads the configuration; a missing key or model stops the application at start-up. */
export function loadOpenAiConfig(env: {
  readonly apiKey: string | undefined;
  readonly model: string | undefined;
  readonly baseUrl: string | undefined;
}): OpenAiConfig {
  if (env.apiKey === undefined || env.apiKey === '')
    throw new Error('OPENAI_API_KEY is required with LLM_DRIVER=openai');
  if (env.model === undefined || env.model === '')
    throw new Error('OPENAI_MODEL is required with LLM_DRIVER=openai');
  return {
    apiKey: env.apiKey,
    model: env.model,
    baseUrl:
      env.baseUrl === undefined || env.baseUrl === ''
        ? DEFAULT_OPENAI_BASE_URL
        : env.baseUrl,
    timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS,
  };
}
