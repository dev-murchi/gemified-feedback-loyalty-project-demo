// Demo simulator: stands in for the Flutter app, which does not exist yet. It hands out what a
// phone produces by itself: the QR content, the device key id, the attestation and the signatures.
// It does not know the backend and never calls it: the requests are put together and sent by hand
// (Postman). The only things it needs from you are the nonce (from POST /v1/auth/challenge) and
// the comment you wrote.
//
//   GET  /qr                              QR content of every branch
//   GET  /devices?platform=ios|android&nonce=…[&deviceId=…]
//                                         a phone's register and session values (new phone without deviceId)
//   POST /devices/{deviceId}/feedback     X-Platform-Proof for the exact body you send (not changed)
//
//   terminal 1:  npm run start:demo   (the API on 3000, with demo data)
//   terminal 2:  npm run demo-sim     (this, on 3001)

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { SIM_PORT } from './config.js';
import { isRawJson } from './json.js';
import { handle, type RouteResult } from './routes.js';

const MAX_BODY_BYTES = 64 * 1024;

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('İstek gövdesi çok büyük');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/** JSON.stringify(value, null, 2), except that raw JSON values are printed exactly as given. */
function pretty(value: unknown, indent = ''): string {
  if (isRawJson(value)) return value.rawJson;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const inner = `${indent}  `;
  const lines = Array.isArray(value)
    ? value.map((item: unknown) => `${inner}${pretty(item, inner)}`)
    : Object.entries(value).map(
        ([key, item]) =>
          `${inner}${JSON.stringify(key)}: ${pretty(item, inner)}`,
      );
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return lines.length === 0
    ? `${open}${close}`
    : `${open}\n${lines.join(',\n')}\n${indent}${close}`;
}

function send(response: ServerResponse, result: RouteResult): void {
  response.writeHead(result.status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(pretty(result.body));
}

const header = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

async function onRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    send(
      response,
      handle({
        method: request.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        body:
          request.method === 'POST' ? await readBody(request) : Buffer.alloc(0),
        idempotencyKey: header(request, 'idempotency-key'),
      }),
    );
  } catch (error) {
    send(response, {
      status: 400,
      body: { error: error instanceof Error ? error.message : 'Hatalı istek' },
    });
  }
}

createServer((request, response) => void onRequest(request, response)).listen(
  SIM_PORT,
  () => {
    console.log(`Demo simulator: http://localhost:${SIM_PORT}`);
  },
);
