// FR-B2B-09 through the real application: every B2B call that passed the guard leaves an audit
// entry before its response, and an audit that cannot be written blocks the data.

import type { AuditLog } from '../../src/contexts/insights/application/ports/audit-log.js';
import type { InMemoryStore } from '../../src/composition/in-memory-store.js';
import { AUDIT_LOG, IN_MEMORY_STORE } from '../../src/composition/tokens.js';
import { B2bApi, DEMO_CLIENTS, demoBranchesOf } from '../support/b2b-api.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';

const [FUEL_BRANCH] = demoBranchesOf('fuel');
if (FUEL_BRANCH === undefined) throw new Error('demo branches missing');

describe('B2B audit log (e2e)', () => {
  let app: FeedbackApp;
  let api: B2bApi;

  const entries = () =>
    app.running.app
      .get<InMemoryStore>(IN_MEMORY_STORE)
      .insights.auditLog.values()
      .map(({ clientId, endpoint, recordCount }) => ({
        clientId,
        endpoint,
        recordCount,
      }));

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  describe('with a working audit log', () => {
    beforeEach(async () => {
      vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
      app = await startFeedbackApp();
      api = new B2bApi(app.running.app);
    });

    it('records each access with the client, the route and the number of records (FR-B2B-09)', async () => {
      const token = await api.tokenFor('fuel-panel');

      await api.get('/v1/b2b/branches', token);
      await api.get(`/v1/b2b/branches/${FUEL_BRANCH.id}/summary`, token);
      await api.get('/v1/b2b/topics', token);

      expect(entries()).toEqual([
        {
          clientId: 'fuel-panel',
          endpoint: 'GET /v1/b2b/branches',
          recordCount: 5,
        },
        {
          clientId: 'fuel-panel',
          endpoint: 'GET /v1/b2b/branches/:branchId/summary',
          recordCount: 1,
        },
        {
          clientId: 'fuel-panel',
          endpoint: 'GET /v1/b2b/topics',
          recordCount: 7,
        },
      ]);
    });

    it('records a refused cross-brand probe with no records, so it can be traced (T-R2)', async () => {
      const coffee = await api.tokenFor('coffee-panel');

      const response = await api.get(
        `/v1/b2b/branches/${FUEL_BRANCH.id}/summary`,
        coffee,
      );

      expect(response.status).toBe(404);
      expect(entries()).toEqual([
        {
          clientId: 'coffee-panel',
          endpoint: 'GET /v1/b2b/branches/:branchId/summary',
          recordCount: 0,
        },
      ]);
    });

    it('records a call refused for a missing scope, with no records (FR-B2B-09)', async () => {
      const listsOnly = await api.tokenFor('fuel-lists');

      const response = await api.get('/v1/b2b/heatmap', listsOnly);

      expect(response.status).toBe(403);
      expect(entries()).toEqual([
        {
          clientId: 'fuel-lists',
          endpoint: 'GET /v1/b2b/heatmap',
          recordCount: 0,
        },
      ]);
    });

    it('records nothing for a request with no valid token: there is no client to record', async () => {
      await api.get('/v1/b2b/branches');

      expect(entries()).toEqual([]);
    });
  });

  it('hands out no data when the audit cannot be written: 500 instead', async () => {
    vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
    const broken: AuditLog = {
      record: () => Promise.reject(new Error('audit store unavailable')),
    };
    app = await startFeedbackApp((builder) =>
      builder.overrideProvider(AUDIT_LOG).useValue(broken),
    );
    api = new B2bApi(app.running.app);
    const token = await api.tokenFor('fuel-panel');

    const response = await api.get('/v1/b2b/branches', token);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(FUEL_BRANCH.id);
  });
});
