import { aClient, CLIENT_ID, NOW } from '../../support/insights-builders.js';
import type { InsightsHarness } from '../../support/memory-insights.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

export function b2bClientRepositoryContract(
  makeHarness: () => Promise<InsightsHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aClient(),
        save: (client) => harness.clients.save(client),
        load: () => harness.clients.findById(CLIENT_ID),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: InsightsHarness;

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('is not found before it is saved', async () => {
      expect(await harness.clients.findById(CLIENT_ID)).toBeUndefined();
    });

    it('loads exactly what was saved, last use and revocation included', async () => {
      const client = aClient({ expiresAt: new Date('2027-01-01T00:00:00Z') });
      client.revoke(NOW);
      client.markUsed(NOW);

      await harness.uow.run(() => harness.clients.save(client));

      expect((await harness.clients.findById(CLIENT_ID))?.state).toEqual(
        client.state,
      );
    });
  });
}
