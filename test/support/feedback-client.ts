import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { demoCatalogSnapshot } from '../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import type { FakeDevice } from './fake-device.js';

/** The demo branches, in snapshot order: the id and the first QR token of each. */
export const demoBranches = Object.values(demoCatalogSnapshot.branches).map(
  (branch) => ({ id: branch.id, token: branch.qrCodes[0]?.token ?? '' }),
);

export const COMMENT =
  'Tuvaletler çok kirliydi, sabun da yoktu. Personel ilgisizdi.';

/** What one POST /v1/feedbacks sends; everything has a sensible default. */
export interface FeedbackRequest {
  readonly text?: string;
  readonly qrToken?: string | undefined;
  /** null sends no Idempotency-Key; by default a new one is made. */
  readonly idempotencyKey?: string | null;
  /** null sends no X-Platform-Proof; a string is sent as is; by default key ‖ body is signed. */
  readonly proof?: string | null;
  /** Replaces the JSON body text entirely (to send extra fields). */
  readonly rawBody?: string;
}

const bodyText = (options: FeedbackRequest): string =>
  options.rawBody ??
  JSON.stringify({
    qrToken: options.qrToken ?? demoBranches[0]?.token,
    text: options.text ?? COMMENT,
  });

/** A phone sending feedback with its access token, the way the Flutter app will. */
export class FeedbackClient {
  constructor(
    private readonly app: NestExpressApplication,
    private readonly device: FakeDevice,
    private accessToken: string,
  ) {}

  /** Uses a newer session's token, e.g. after the clock moved past the old one's 15 minutes. */
  useToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  get token(): string {
    return this.accessToken;
  }

  http() {
    return request(this.app.getHttpServer());
  }

  /** Sends the body as an exact string, so the proof covers the very bytes the server reads. */
  submit(options: FeedbackRequest = {}) {
    const key =
      options.idempotencyKey === undefined
        ? randomUUID()
        : options.idempotencyKey;
    const body = bodyText(options);
    const proof =
      options.proof === undefined
        ? this.device.requestProof(key ?? '', Buffer.from(body, 'utf8'))
        : options.proof;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      ...(key === null ? {} : { 'Idempotency-Key': key }),
      ...(proof === null ? {} : { 'X-Platform-Proof': proof }),
    };
    return this.http().post('/v1/feedbacks').set(headers).send(body);
  }

  status(feedbackId: string, accessToken = this.accessToken) {
    return this.http()
      .get(`/v1/feedbacks/${feedbackId}`)
      .set('Authorization', `Bearer ${accessToken}`);
  }
}
