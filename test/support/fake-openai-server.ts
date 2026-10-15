import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * What the fake answers next: a status and a JSON body; no answer at all (a hang); or a body sent
 * as is, which with `stall` stops after this text and never ends.
 */
export type ScriptedReply =
  | { readonly status: number; readonly body: unknown }
  | { readonly hang: true }
  | { readonly status: number; readonly raw: string; readonly stall?: boolean };

export interface ReceivedRequest {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: unknown;
}

export interface FakeOpenAiServer {
  readonly baseUrl: string;
  readonly received: ReceivedRequest[];
  /** Replies in order; the last one repeats. */
  script: ScriptedReply[];
  close(): Promise<void>;
}

/** A Chat Completions reply whose message content is `content` (a JSON string for the schema). */
export const completion = (content: string, model = 'gpt-test-2026-01-01') => ({
  status: 200,
  body: {
    id: 'chatcmpl-test',
    model,
    choices: [
      { index: 0, message: { role: 'assistant', content, refusal: null } },
    ],
    usage: { prompt_tokens: 612, completion_tokens: 31 },
  },
});

/**
 * A local stand-in for the OpenAI API on 127.0.0.1 and a free port: it records every request and
 * answers from a script. No test ever calls the real provider.
 */
export async function startFakeOpenAi(): Promise<FakeOpenAiServer> {
  const received: ReceivedRequest[] = [];
  const fake = { script: [completion('{}')] as ScriptedReply[] };
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
      });
      const reply =
        fake.script.length > 1 ? fake.script.shift() : fake.script[0];
      if (reply === undefined || 'hang' in reply) return;
      response.writeHead(reply.status, { 'Content-Type': 'application/json' });
      if (!('raw' in reply)) return response.end(JSON.stringify(reply.body));
      if (reply.stall === true) return response.write(reply.raw);
      return response.end(reply.raw);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return Object.assign(fake, {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
}
