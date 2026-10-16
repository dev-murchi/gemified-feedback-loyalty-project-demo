import { JoseB2bTokens } from '../../../src/contexts/insights/adapters/outbound/jose-b2b-tokens.js';
import type { SecretHash } from '../../../src/contexts/insights/domain/b2b-client/secret-hash.js';
import type { SecretHasher } from '../../../src/contexts/insights/application/ports/secret-hasher.js';
import {
  IssueB2bToken,
  type IssueB2bTokenCommand,
} from '../../../src/contexts/insights/application/use-cases/issue-b2b-token.js';
import { loadB2bSigningKey } from '../../../src/contexts/insights/adapters/outbound/b2b-signing-key.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  aClient,
  B2B_BRAND_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  fakeHasher,
  NOW,
} from '../../support/insights-builders.js';
import {
  memoryInsightsHarness,
  type InsightsHarness,
} from '../../support/memory-insights.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const request = (
  overrides: Partial<IssueB2bTokenCommand> = {},
): IssueB2bTokenCommand => ({
  grantType: 'client_credentials',
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  scope: undefined,
  ...overrides,
});

describe('IssueB2bToken (FR-B2B-01)', () => {
  let harness: InsightsHarness;
  let clock: FakeClock;
  let tokens: JoseB2bTokens;
  let checked: string[];
  let issue: IssueB2bToken;

  beforeEach(async () => {
    harness = await memoryInsightsHarness();
    clock = new FakeClock(NOW);
    const key = loadB2bSigningKey(
      {
        nodeEnv: 'test',
        privateKeyPem: undefined,
        keyId: undefined,
      },
      new RecordingLogger(),
    );
    tokens = new JoseB2bTokens({ key, clock });
    checked = [];
    const recordingHasher: SecretHasher = {
      hash: (secret) => fakeHasher.hash(secret),
      verify: (secret, hash) => {
        checked.push(hash);
        return fakeHasher.verify(secret, hash);
      },
    };
    issue = new IssueB2bToken({
      clients: harness.clients,
      hasher: recordingHasher,
      tokens,
      clock,
      uow: harness.uow,
      decoyHash: 'fake$decoy' as SecretHash,
    });
    await harness.uow.run(() => harness.clients.save(aClient()));
  });

  it('issues a 15-minute bearer token with all the client’s scopes when none are asked for', async () => {
    const result = await issue.execute(request());

    expect(result).toMatchObject({
      ok: true,
      value: {
        tokenType: 'Bearer',
        expiresIn: 900,
        scope: 'b2b.feedback.read b2b.summary.read',
      },
    });
  });

  it('issues a token that verifies to the client, its brand and the granted scopes', async () => {
    const result = await issue.execute(request({ scope: 'b2b.summary.read' }));
    if (!result.ok) throw new Error('token was refused');

    expect(await tokens.verify(result.value.accessToken)).toEqual({
      ok: true,
      value: {
        clientId: CLIENT_ID,
        brandId: B2B_BRAND_ID,
        scopes: ['b2b.summary.read'],
      },
    });
  });

  it('treats an empty scope like an absent one, never as a token with no scopes', async () => {
    expect(await issue.execute(request({ scope: '' }))).toMatchObject({
      ok: true,
      value: { scope: 'b2b.feedback.read b2b.summary.read' },
    });
  });

  it.each<[string, Partial<IssueB2bTokenCommand>]>([
    ['a wrong secret', { clientSecret: 'guess' }],
    ['an unknown client', { clientId: 'brand-z-panel' }],
  ])('refuses %s as invalid_client', async (_case, overrides) => {
    expect(await issue.execute(request(overrides))).toEqual({
      ok: false,
      error: { error: 'invalid_client' },
    });
  });

  it('checks a secret for an unknown client too, against the decoy, so timing tells nothing', async () => {
    await issue.execute(request({ clientId: 'brand-z-panel' }));

    expect(checked).toEqual(['fake$decoy']);
  });

  describe('last use (FR-B2B-01, T-S6; B2B_CLIENTS.last_used_at)', () => {
    const lastUsed = async () =>
      (await harness.clients.findById(CLIENT_ID))?.state.lastUsedAt;

    it('records the time a token was issued', async () => {
      clock.advance(60_000);

      await issue.execute(request());

      expect(await lastUsed()).toEqual(new Date(NOW.getTime() + 60_000));
    });

    it.each<[string, Partial<IssueB2bTokenCommand>]>([
      ['a wrong secret', { clientSecret: 'guess' }],
      ['a scope the client lacks', { scope: 'b2b.admin' }],
    ])(
      'leaves it unchanged for a refused request: %s',
      async (_case, overrides) => {
        await issue.execute(request(overrides));

        expect(await lastUsed()).toBeNull();
      },
    );

    it('leaves it unchanged for a revoked client', async () => {
      const client = await harness.clients.findById(CLIENT_ID);
      client?.revoke(NOW);
      if (client !== undefined)
        await harness.uow.run(() => harness.clients.save(client));

      await issue.execute(request());

      expect(await lastUsed()).toBeNull();
    });
  });

  it('answers a malformed client id like an unknown one, after the same decoy check', async () => {
    const result = await issue.execute(request({ clientId: 'Brand A Panel!' }));

    expect(result).toEqual({ ok: false, error: { error: 'invalid_client' } });
    expect(checked).toEqual(['fake$decoy']);
  });

  it('refuses a revoked client with the same answer (TC-B2B-05)', async () => {
    const client = await harness.clients.findById(CLIENT_ID);
    client?.revoke(NOW);
    if (client !== undefined)
      await harness.uow.run(() => harness.clients.save(client));

    expect(await issue.execute(request())).toEqual({
      ok: false,
      error: { error: 'invalid_client' },
    });
  });

  it.each<[string, Partial<IssueB2bTokenCommand>, string]>([
    ['another grant type', { grantType: 'password' }, 'unsupported_grant_type'],
    [
      'a missing grant type',
      { grantType: undefined },
      'unsupported_grant_type',
    ],
    ['a missing client id', { clientId: undefined }, 'invalid_request'],
    ['a missing secret', { clientSecret: undefined }, 'invalid_request'],
    ['an unknown scope', { scope: 'b2b.admin' }, 'invalid_scope'],
  ])('refuses %s with %s', async (_case, overrides, error) => {
    expect(await issue.execute(request(overrides))).toEqual({
      ok: false,
      error: { error },
    });
  });

  it('checks the format before the secret, so a malformed request costs no hash', async () => {
    await issue.execute(request({ grantType: 'password' }));

    expect(checked).toEqual([]);
  });
});
