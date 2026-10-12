import type { WalletRepository } from '../../src/contexts/gamification/application/ports/wallet-repository.js';
import {
  CHALLENGE_STORE,
  WALLET_REPOSITORY,
} from '../../src/composition/tokens.js';
import { MemoryChallengeStore } from '../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import { AuthClient, problemOf, without } from '../support/auth-client.js';
import { FakeDevice } from '../support/fake-device.js';
import { startApp } from '../support/start-app.js';

// T-I7 (docs/03): error responses must not leak the internal structure. Every kind of error the
// API can produce is provoked here and its response is searched for internals.

const SECRET = 'wallet-db-password-hunter2';

/** A wallet store that fails with an error full of internals. */
const leakyWallets: WalletRepository = {
  findById: () => Promise.resolve(undefined),
  findWithLedgerKey: () => Promise.resolve(undefined),
  findLedgerEntry: () => Promise.resolve(undefined),
  save: () =>
    Promise.reject(
      new Error(
        `connect ECONNREFUSED 10.0.3.7:5432 ${SECRET} at /srv/app/db.ts:42`,
      ),
    ),
};

/** The fields the `Problem` schema allows. */
const PROBLEM_FIELDS = new Set([
  'type',
  'title',
  'status',
  'detail',
  'code',
  'requestId',
  'retryAfterSeconds',
  'errors',
]);

/** Things that only an internal error text, stack trace or server detail would contain. */
const INTERNALS = [
  SECRET,
  'ECONNREFUSED',
  '10.0.3.7',
  '/srv/app',
  'node_modules',
  '.ts:',
  '.js:',
  '    at ',
  'Error:',
  'stack',
  'Nest',
  'Express',
  'postgres',
];

describe('error responses leak no internals (T-I7, e2e)', () => {
  it('holds for every kind of error the API can answer', async () => {
    // Given an API whose wallet store fails with internals in its message, and a tiny challenge cap
    const running = await startApp((builder, { clock }) =>
      builder
        .overrideProvider(WALLET_REPOSITORY)
        .useValue(leakyWallets)
        .overrideProvider(CHALLENGE_STORE)
        .useValue(new MemoryChallengeStore({ clock, maxLive: 6 })),
    );
    const client = new AuthClient(running.app);
    const device = new FakeDevice();

    // When each kind of error is provoked
    const responses = [
      // 500: the wallet store throws while registering
      await client.register(device),
      // 400: format errors
      await client.register(device, {
        tweak: (body) => without(body, 'platform'),
      }),
      await client.register(device, {
        tweak: (body) => ({ ...body, extra: 1 }),
      }),
      await client
        .http()
        .post('/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"broken":'),
      // 401: bad challenge, bad token
      await client
        .http()
        .post('/v1/auth/session')
        .send({
          platform: 'android',
          keyId: device.androidKeyIdentifier,
          nonce: 'A'.repeat(43),
          signature: 'AAAA',
        }),
      await client.wallet('not-a-token'),
      await client.wallet(undefined),
      // 404: unknown route, wrong method
      await client.http().get('/v1/does-not-exist'),
      await client.http().get('/v1/auth/register'),
      // 413: oversized body
      await client
        .http()
        .post('/v1/auth/register')
        .send({ padding: 'x'.repeat(9 * 1024) }),
      // 429: challenge cap (six challenges already waited for above, then more)
      ...(
        await Promise.all(
          Array.from({ length: 8 }, () =>
            client.http().post('/v1/auth/challenge'),
          ),
        )
      ).filter((response) => response.status === 429),
    ];

    // Then there were all the kinds we meant to provoke
    const statuses = new Set(responses.map((response) => response.status));
    expect([...statuses].sort()).toEqual([400, 401, 404, 413, 429, 500]);

    for (const response of responses) {
      const body = JSON.stringify(response.body);
      // each is a Problem with nothing but its documented fields
      expect(
        Object.keys(response.body as object).filter(
          (key) => !PROBLEM_FIELDS.has(key),
        ),
      ).toEqual([]);
      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      // no internals anywhere in the body or the headers
      for (const internal of INTERNALS) {
        expect(body).not.toContain(internal);
        expect(JSON.stringify(response.headers)).not.toContain(internal);
      }
      expect(response.headers['x-powered-by']).toBeUndefined();
      // the caller can quote the request id to support
      expect(problemOf(response).requestId).toBe(
        response.headers['x-request-id'],
      );
    }

    // And an unexpected error carries no detail at all; its text is only in the log (without the secret)
    const internalError = responses.find((response) => response.status === 500);
    expect(problemOf(internalError ?? { body: {} })).not.toHaveProperty(
      'detail',
    );
    expect(JSON.stringify(running.logger.warnings)).not.toContain(SECRET);
    await running.app.close();
  });
});
