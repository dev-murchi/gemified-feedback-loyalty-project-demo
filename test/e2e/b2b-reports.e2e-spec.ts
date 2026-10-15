// S0-09 over real HTTP: the B2B read endpoints with real feedback from the mobile API, analyzed by
// the demo stand-in. Tenant isolation, scopes and spam exclusion; every response is also checked
// against the contract, which allows no extra field (TC-B2B-03).

import type { ProcessAnalysisJob } from '../../src/contexts/analysis/application/use-cases/process-analysis-job.js';
import { PROCESS_ANALYSIS_JOB } from '../../src/composition/tokens.js';
import type { FeedbackId } from '../../src/shared-kernel/ids.js';
import { problemOf } from '../support/auth-client.js';
import { B2bApi, DEMO_CLIENTS, demoBranchesOf } from '../support/b2b-api.js';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';

const [FUEL_BRANCH] = demoBranchesOf('fuel');
const [COFFEE_BRANCH] = demoBranchesOf('coffee');
if (FUEL_BRANCH === undefined || COFFEE_BRANCH === undefined)
  throw new Error('demo branches missing');

describe('B2B reports (e2e)', () => {
  let app: FeedbackApp;
  let api: B2bApi;
  let fuelToken: string;
  let coffeeToken: string;
  let validId: string;

  /** Sends a comment at a branch over HTTP and runs its analysis, as the worker will (S0-10). */
  const analyzed = async (
    qrToken: string,
    text: string,
    sector: 'fuel' | 'coffee',
  ) => {
    const response = await app.client.submit({ qrToken, text });
    expect(response.status).toBe(202);
    const { feedbackId, submittedAt } = response.body as {
      feedbackId: string;
      submittedAt: string;
    };
    await app.running.app
      .get<ProcessAnalysisJob>(PROCESS_ANALYSIS_JOB)
      .execute({
        feedbackId: feedbackId as FeedbackId,
        sector,
        submittedAt: new Date(submittedAt),
      });
    return feedbackId;
  };

  beforeEach(async () => {
    vi.stubEnv('B2B_DEMO_CLIENTS', JSON.stringify(DEMO_CLIENTS));
    app = await startFeedbackApp();
    api = new B2bApi(app.running.app);
    validId = await analyzed(
      FUEL_BRANCH.token,
      'Tuvaletler çok kirliydi, sabun da yoktu.',
      'fuel',
    );
    app.running.clock.advance(60_000);
    await analyzed(
      demoBranchesOf('fuel')[1]?.token ?? '',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'fuel',
    );
    await analyzed(
      COFFEE_BRANCH.token,
      'Kahve soğuktu ve çok bekledik, berbat.',
      'coffee',
    );
    fuelToken = await api.tokenFor('fuel-panel');
    coffeeToken = await api.tokenFor('coffee-panel');
  });

  afterEach(async () => {
    await app.running.app.close();
    vi.unstubAllEnvs();
  });

  it('lists the brand’s valid feedback with masked text only; spam and other brands never (TC-B2B-02, TC-B2B-03)', async () => {
    const response = await api.get('/v1/b2b/feedbacks', fuelToken);

    expect(response.status).toBe(200);
    const body = response.body as {
      items: { id: string; status: string }[];
      nextCursor: string | null;
    };
    expect(body.items.map((item) => item.id)).toEqual([validId]);
    expect(body).toMatchObject({
      items: [
        { status: 'valid', sentiment: 'neutral', topic: { key: 'other' } },
      ],
      nextCursor: null,
    });
  });

  it('gives each brand only its own branches and heatmap (TC-B2B-01)', async () => {
    const fuelBranches = await api.get('/v1/b2b/branches', fuelToken);
    const coffeeHeatmap = await api.get('/v1/b2b/heatmap', coffeeToken);

    const fuelIds = (
      fuelBranches.body as { items: { id: string }[] }
    ).items.map((b) => b.id);
    const coffeeIds = (
      coffeeHeatmap.body as { items: { branchId: string }[] }
    ).items.map((b) => b.branchId);
    expect(fuelIds.sort()).toEqual(
      demoBranchesOf('fuel')
        .map((b) => b.id)
        .sort(),
    );
    expect(coffeeIds.sort()).toEqual(
      demoBranchesOf('coffee')
        .map((b) => b.id)
        .sort(),
    );
  });

  it.each([
    ['the feedback list', `/v1/b2b/feedbacks?branchId=${FUEL_BRANCH.id}`],
    ['a branch summary', `/v1/b2b/branches/${FUEL_BRANCH.id}/summary`],
  ])(
    'answers 404 for another brand’s branch in %s, so it does not leak (TC-B2B-01, FR-B2B-08)',
    async (_case, path) => {
      const response = await api.get(path, coffeeToken);

      expect(response.status).toBe(404);
      expect(problemOf(response).code).toBe('NOT_FOUND');
    },
  );

  it('summarizes a branch: spam not counted, complaint rule applied (FR-B2B-04)', async () => {
    const response = await api.get(
      `/v1/b2b/branches/${FUEL_BRANCH.id}/summary`,
      fuelToken,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      branchId: FUEL_BRANCH.id,
      timeZone: 'Europe/Istanbul',
      totalFeedbacks: 1,
      complaintCount: 0,
      unanalyzedCount: 0,
      sentimentDistribution: { neutral: 1 },
      topTopics: [{ key: 'other', count: 1 }],
    });
  });

  it('gives the brand sector’s topics', async () => {
    const response = await api.get('/v1/b2b/topics', coffeeToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ sector: 'coffee' });
  });

  it.each(['/v1/b2b/branches/x/summary', '/v1/b2b/heatmap'])(
    'answers 403 when the token lacks the summary scope: %s (TC-B2B-04)',
    async (path) => {
      const listsOnly = await api.tokenFor('fuel-lists');
      const response = await api.get(
        path.replace('x', FUEL_BRANCH.id),
        listsOnly,
      );

      expect(response.status).toBe(403);
      expect(problemOf(response).code).toBe('FORBIDDEN');
    },
  );

  it.each([
    '/v1/b2b/branches',
    '/v1/b2b/feedbacks',
    '/v1/b2b/heatmap',
    '/v1/b2b/topics',
    `/v1/b2b/branches/${FUEL_BRANCH.id}/summary`,
  ])('answers 401 without a token: %s', async (path) => {
    expect((await api.get(path)).status).toBe(401);
  });

  it.each([
    ['/v1/b2b/feedbacks?limit=abc', 'limit'],
    ['/v1/b2b/feedbacks?from=2026-02-30', 'from'],
    ['/v1/b2b/heatmap?timeZone=Mars/Olympus', 'timeZone'],
    ['/v1/b2b/feedbacks?branchId=kadikoy', 'branchId'],
  ])(
    'rejects %s with 400 VALIDATION_ERROR on %s (TC-API-04)',
    async (path, field) => {
      const response = await api.get(path, fuelToken);

      expect(response.status).toBe(400);
      expect(problemOf(response).errors?.[0]?.field).toBe(field);
    },
  );
});
