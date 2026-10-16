import { parseDemoClients } from '../../../src/contexts/insights/adapters/inbound/demo/demo-b2b-clients.js';
import { loadDemoB2bClients } from '../../../src/composition/demo-b2b-clients.js';
import { DEFAULT_DEMO_CLIENT_LIFETIME_MS } from '../../../src/contexts/insights/adapters/inbound/demo/demo-b2b-clients.js';
import type { ClientId } from '../../../src/contexts/insights/domain/b2b-client/client-id.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  fakeHasher,
  B2B_BRAND_ID,
  NOW,
} from '../../support/insights-builders.js';
import { memoryInsightsHarness } from '../../support/memory-insights.js';

const SECRET = 'a-demo-secret-that-is-long-enough-123';
const entry = {
  clientId: 'fuel-panel',
  brand: 'fuel',
  secret: SECRET,
  scope: 'b2b.feedback.read',
};
const CONTEXT = { brands: { fuel: B2B_BRAND_ID }, now: NOW };
const DEFAULT_EXPIRY = new Date(
  NOW.getTime() + DEFAULT_DEMO_CLIENT_LIFETIME_MS,
);

describe('demo B2B clients (owner decision 1 of S0-09)', () => {
  it('reads B2B_DEMO_CLIENTS into clients of the demo brands', () => {
    expect(parseDemoClients(JSON.stringify([entry]), CONTEXT)).toEqual([
      {
        clientId: 'fuel-panel',
        brandId: B2B_BRAND_ID,
        secret: SECRET,
        scopes: ['b2b.feedback.read'],
        expiresAt: DEFAULT_EXPIRY,
      },
    ]);
  });

  it.each([
    ['not JSON', 'nope', 'is not valid JSON'],
    ['not an array of clients', JSON.stringify({ entry }), 'must be an array'],
    [
      'an unknown brand',
      JSON.stringify([{ ...entry, brand: 'bakery' }]),
      'unknown demo brand "bakery"',
    ],
    [
      'a short secret',
      JSON.stringify([{ ...entry, secret: 'short' }]),
      'at least 32 characters',
    ],
    [
      'no known scope',
      JSON.stringify([{ ...entry, scope: 'b2b.admin' }]),
      'needs known scopes',
    ],
    [
      'an empty scope',
      JSON.stringify([{ ...entry, scope: '' }]),
      'needs known scopes',
    ],
  ])(
    'stops start-up for %s, never naming the secret',
    (_case, json, message) => {
      expect(() => parseDemoClients(json, CONTEXT)).toThrow(message);
      try {
        parseDemoClients(json, CONTEXT);
      } catch (error) {
        expect(String(error)).not.toContain(SECRET);
      }
    },
  );

  it('gives every demo client an expiry: the one set, or 90 days after start-up (FR-B2B-01)', () => {
    const json = JSON.stringify([
      { ...entry, clientId: 'fuel-panel' },
      { ...entry, clientId: 'fuel-panel-2', expiresAt: '2027-03-01T00:00:00Z' },
    ]);

    expect(
      parseDemoClients(json, CONTEXT).map((client) => client.expiresAt),
    ).toEqual([DEFAULT_EXPIRY, new Date('2027-03-01T00:00:00Z')]);
  });

  describe('loadDemoB2bClients', () => {
    const json = JSON.stringify([{ ...entry, brand: 'fuel' }]);

    it('loads nothing without the variable', async () => {
      const harness = await memoryInsightsHarness();

      expect(
        await loadDemoB2bClients(
          {},
          { ...harness, hasher: fakeHasher, clock: new FakeClock(NOW) },
        ),
      ).toEqual({ loaded: 0 });
    });

    it('stores the clients with hashed secrets with DEMO_DATA=true', async () => {
      const harness = await memoryInsightsHarness();

      const result = await loadDemoB2bClients(
        { DEMO_DATA: 'true', NODE_ENV: 'test', B2B_DEMO_CLIENTS: json },
        { ...harness, hasher: fakeHasher, clock: new FakeClock(NOW) },
      );

      expect(result).toEqual({ loaded: 1 });
      expect(
        (await harness.clients.findById('fuel-panel' as ClientId))?.secretHash,
      ).toBe(`fake$${SECRET}`);
    });

    it('refuses to start in production', async () => {
      const harness = await memoryInsightsHarness();

      await expect(
        loadDemoB2bClients(
          { NODE_ENV: 'production', B2B_DEMO_CLIENTS: json },
          { ...harness, hasher: fakeHasher, clock: new FakeClock(NOW) },
        ),
      ).rejects.toThrow(
        'B2B_DEMO_CLIENTS is not allowed when NODE_ENV=production',
      );
    });

    it('refuses to start without DEMO_DATA=true, since its clients belong to the demo brands', async () => {
      const harness = await memoryInsightsHarness();

      await expect(
        loadDemoB2bClients(
          { NODE_ENV: 'test', B2B_DEMO_CLIENTS: json },
          { ...harness, hasher: fakeHasher, clock: new FakeClock(NOW) },
        ),
      ).rejects.toThrow('B2B_DEMO_CLIENTS needs DEMO_DATA=true');
    });
  });
});
