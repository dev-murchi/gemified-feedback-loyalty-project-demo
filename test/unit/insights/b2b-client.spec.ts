import { aClient, NOW } from '../../support/insights-builders.js';

const later = new Date('2027-01-01T00:00:00.000Z');

describe('B2bClient (FR-B2B-01)', () => {
  it('grants all its scopes when none are asked for (absent or empty scope)', () => {
    expect(aClient().grant([], NOW)).toEqual({
      ok: true,
      value: ['b2b.feedback.read', 'b2b.summary.read'],
    });
  });

  it('grants the asked scopes when it has every one of them', () => {
    expect(aClient().grant(['b2b.summary.read'], NOW)).toEqual({
      ok: true,
      value: ['b2b.summary.read'],
    });
  });

  it('refuses a scope it does not have: invalid_scope', () => {
    const client = aClient({ scopes: ['b2b.feedback.read'] });

    expect(
      client.grant(['b2b.feedback.read', 'b2b.summary.read'], NOW),
    ).toEqual({
      ok: false,
      error: { error: 'invalid_scope' },
    });
  });

  it('gives a revoked client no token (TC-B2B-05)', () => {
    const client = aClient();
    client.revoke(NOW);

    expect(client.grant([], later)).toEqual({
      ok: false,
      error: { error: 'invalid_client' },
    });
  });

  it('gives an expired client no token, from its expiry time on (TC-B2B-05)', () => {
    const client = aClient({ expiresAt: later });

    expect(client.grant([], new Date(later.getTime() - 1)).ok).toBe(true);
    expect(client.grant([], later)).toEqual({
      ok: false,
      error: { error: 'invalid_client' },
    });
  });

  it('keeps the first revocation time when revoked again', () => {
    const client = aClient();
    client.revoke(NOW);

    client.revoke(later);

    expect(client.state.revokedAt).toEqual(NOW);
  });
});
