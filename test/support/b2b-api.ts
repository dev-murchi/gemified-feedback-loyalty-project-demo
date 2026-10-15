import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { demoCatalogSnapshot } from '../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';

/** Demo branches of one brand (`fuel` or `coffee`), from the snapshot keys. */
export const demoBranchesOf = (brand: 'fuel' | 'coffee') =>
  Object.entries(demoCatalogSnapshot.branches)
    .filter(([key]) => key.startsWith(`${brand}-`))
    .map(([, branch]) => ({
      id: branch.id,
      token: branch.qrCodes[0]?.token ?? '',
    }));

const secret = (name: string) =>
  `${name}-secret-that-is-long-enough-for-the-demo`;

/** Three demo clients: one per brand with both scopes, and a fuel client that only lists. */
export const DEMO_CLIENTS = [
  {
    clientId: 'fuel-panel',
    brand: 'fuel',
    secret: secret('fuel'),
    scope: 'b2b.feedback.read b2b.summary.read',
  },
  {
    clientId: 'coffee-panel',
    brand: 'coffee',
    secret: secret('coffee'),
    scope: 'b2b.feedback.read b2b.summary.read',
  },
  {
    clientId: 'fuel-lists',
    brand: 'fuel',
    secret: secret('lists'),
    scope: 'b2b.feedback.read',
  },
] as const;

export type DemoClientId = (typeof DEMO_CLIENTS)[number]['clientId'];

/** A brand panel talking to the B2B API over HTTP. */
export class B2bApi {
  constructor(private readonly app: NestExpressApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  /** POST /v1/b2b/oauth/token as a form, the way RFC 6749 §4.4 asks. */
  token(fields: Record<string, string>) {
    return this.http().post('/v1/b2b/oauth/token').type('form').send(fields);
  }

  async tokenFor(clientId: DemoClientId, scope?: string): Promise<string> {
    const client = DEMO_CLIENTS.find(
      (candidate) => candidate.clientId === clientId,
    );
    const response = await this.token({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: client?.secret ?? '',
      ...(scope === undefined ? {} : { scope }),
    });
    if (response.status !== 200)
      throw new Error(`no token for ${clientId}: ${response.status}`);
    return (response.body as { access_token: string }).access_token;
  }

  get(path: string, accessToken?: string) {
    const call = this.http().get(path);
    return accessToken === undefined
      ? call
      : call.set('Authorization', `Bearer ${accessToken}`);
  }
}
