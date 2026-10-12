import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Problem } from '../../src/platform/http/problem-details.js';
import { FakeDevice, type EvidenceOptions } from './fake-device.js';

export type Platform = 'ios' | 'android';

/** How a test registers: the platform (default android), evidence options and a body change. */
export interface RegisterVariant {
  readonly platform?: Platform;
  readonly options?: EvidenceOptions;
  readonly tweak?: (body: Record<string, unknown>) => Record<string, unknown>;
}

/** A copy of the body without one property. */
export const without = (
  body: Record<string, unknown>,
  key: string,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(body).filter(([name]) => name !== key));

/** A phone talking to the API over HTTP: it does what the Flutter app will do. */
export class AuthClient {
  constructor(private readonly app: NestExpressApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  async nonce(): Promise<string> {
    const response = await this.http().post('/v1/auth/challenge');
    return (response.body as { nonce: string }).nonce;
  }

  /** Fetches a challenge and registers; `tweak` can damage the request body. */
  async register(device: FakeDevice, variant: RegisterVariant = {}) {
    const nonce = await this.nonce();
    const evidence =
      variant.platform === 'ios'
        ? device.iosEvidence(nonce, variant.options)
        : device.androidEvidence(nonce, variant.options);
    const body = { nonce, ...evidence };
    return this.http()
      .post('/v1/auth/register')
      .send(variant.tweak === undefined ? body : variant.tweak(body));
  }

  /** Fetches a challenge and opens a session with the registered key. */
  async session(
    device: FakeDevice,
    platform: Platform = 'android',
    options: EvidenceOptions = {},
  ) {
    const nonce = await this.nonce();
    const proof = device.sessionProof(nonce, options);
    return this.http()
      .post('/v1/auth/session')
      .send({
        platform,
        keyId:
          platform === 'ios' ? device.iosKeyId : device.androidKeyIdentifier,
        nonce,
        ...(platform === 'ios' ? { assertion: proof } : { signature: proof }),
      });
  }

  wallet(accessToken: string | undefined) {
    const call = this.http().get('/v1/me/wallet');
    return accessToken === undefined
      ? call
      : call.set('Authorization', `Bearer ${accessToken}`);
  }
}

export const problemOf = (response: { body: unknown }): Problem =>
  response.body as Problem;

export const EMPTY_WALLET = {
  xp: 0,
  points: 0,
  level: 1,
  xpForNextLevel: 100,
  xpToNextLevel: 100,
};
