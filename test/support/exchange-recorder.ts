import type { NextFunction, Request, Response } from 'express';
import { Contract, type Exchange } from './contract.js';

/** Responses that do not match the contract, collected while a test runs. */
const violations: string[] = [];

/** Takes (and clears) what the contract check found since the last call. */
export function takeViolations(): string[] {
  return violations.splice(0, violations.length);
}

const contracts = new Map<string, Contract>();

const contractAt = (path: string): Contract => {
  const known = contracts.get(path);
  if (known !== undefined) return known;
  const loaded = new Contract(path);
  contracts.set(path, loaded);
  return loaded;
};

const contentTypeOf = (headers: Record<string, unknown>): string => {
  const value = headers['content-type'];
  return typeof value === 'string' ? value : '';
};

const bodyOf = (sent: unknown, contentType: string): unknown => {
  if (sent === undefined || sent === null) return undefined;
  const text = Buffer.isBuffer(sent)
    ? sent.toString('utf8')
    : typeof sent === 'string'
      ? sent
      : JSON.stringify(sent);
  if (!contentType.includes('json')) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/**
 * Test-only middleware: records every response the real application sends and checks it against
 * the contract once it is finished. Failures are collected and reported by the e2e setup file after
 * each test, so every test of the suite also tests the contract.
 */
export function contractRecorder(contractPath: string) {
  const contract = contractAt(contractPath);
  return (request: Request, response: Response, next: NextFunction): void => {
    let sent: unknown;
    const send = response.send.bind(response);
    response.send = (body?: unknown): Response => {
      sent = body;
      return send(body);
    };
    response.on('finish', () => {
      const headers = response.getHeaders();
      const exchange: Exchange = {
        method: request.method,
        path: request.originalUrl.split('?')[0] ?? request.originalUrl,
        status: response.statusCode,
        headers,
        body: bodyOf(sent, contentTypeOf(headers)),
      };
      violations.push(...contract.violationsOf(exchange));
    });
    next();
  };
}
