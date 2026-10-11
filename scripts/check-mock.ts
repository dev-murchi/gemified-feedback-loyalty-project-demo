// S0-02 smoke check: every endpoint of docs/api/openapi.yaml answers on the Prism mock
// with one of its documented success statuses. Request bodies are the contract's examples.
//
// docker compose --profile mock up -d mock
// npm run contract:mock:check

interface Check {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly expected: readonly number[];
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

const BASE_URL = process.env.MOCK_URL ?? 'http://localhost:4010';
const BEARER = { Authorization: 'Bearer mock-token' };
const JSON_BODY = { 'Content-Type': 'application/json' };
const NONCE = 'q0Zx3nV6p1cW8sT2mYkR4aL9eJbH7uDf5gNtVwXyZ0A';
const FEEDBACK_ID = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const BRANCH_ID = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

const checks: readonly Check[] = [
  { method: 'POST', path: '/v1/auth/challenge', expected: [200] },
  {
    method: 'POST',
    path: '/v1/auth/register',
    expected: [200, 201],
    headers: JSON_BODY,
    body: JSON.stringify({
      platform: 'ios',
      nonce: NONCE,
      keyId: 'bXlLZXlJZEZyb21BcHBBdHRlc3RTZXJ2aWNl',
      attestationObject: 'o2NmbXRvYXBwbGUtYXBwYXR0ZXN0Z2F0dFN0bXSi...',
    }),
  },
  {
    method: 'POST',
    path: '/v1/auth/session',
    expected: [200],
    headers: JSON_BODY,
    body: JSON.stringify({
      platform: 'ios',
      keyId: 'bXlLZXlJZEZyb21BcHBBdHRlc3RTZXJ2aWNl',
      nonce: 'Zt8bQ1xW3eR5yU7iO9pA2sD4fG6hJ8kL0zX1cV3bN5m',
      assertion: 'omlzaWduYXR1cmVYRzBFAiEAy...',
    }),
  },
  { method: 'GET', path: '/v1/me/wallet', expected: [200], headers: BEARER },
  {
    method: 'POST',
    path: '/v1/feedbacks',
    expected: [202],
    headers: {
      ...BEARER,
      ...JSON_BODY,
      'Idempotency-Key': '6f1d2c3b-4a5e-4f6a-9b8c-7d6e5f4a3b2c',
    },
    body: JSON.stringify({
      qrToken: 'Kp3vX9qL2mT7wR4yB8nZ1cF6hJ0sD5aE',
      text: 'Tuvaletler çok kirliydi, sabun da yoktu. Personel ilgisizdi.',
    }),
  },
  {
    method: 'GET',
    path: `/v1/feedbacks/${FEEDBACK_ID}`,
    expected: [200],
    headers: BEARER,
  },
  {
    method: 'POST',
    path: '/v1/b2b/oauth/token',
    expected: [200],
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'brand-a-panel',
      client_secret: 's3cr3t-only-for-demo',
      scope: 'b2b.feedback.read b2b.summary.read',
    }).toString(),
  },
  { method: 'GET', path: '/v1/b2b/branches', expected: [200], headers: BEARER },
  {
    method: 'GET',
    path: '/v1/b2b/feedbacks',
    expected: [200],
    headers: BEARER,
  },
  {
    method: 'GET',
    path: `/v1/b2b/branches/${BRANCH_ID}/summary`,
    expected: [200],
    headers: BEARER,
  },
  { method: 'GET', path: '/v1/b2b/heatmap', expected: [200], headers: BEARER },
  { method: 'GET', path: '/v1/b2b/topics', expected: [200], headers: BEARER },
];

async function run(check: Check): Promise<boolean> {
  const response = await fetch(`${BASE_URL}${check.path}`, {
    method: check.method,
    headers: check.headers ?? {},
    body: check.body ?? null,
  });
  const ok = check.expected.includes(response.status);
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${response.status} ${check.method} ${check.path}`);
  if (!ok) console.log(`     ${await response.text()}`);
  return ok;
}

const results: boolean[] = [];
for (const check of checks) results.push(await run(check));

const passed = results.filter(Boolean).length;
console.log(
  `\n${passed}/${checks.length} endpoints answered with a documented success status.`,
);
if (passed !== checks.length) process.exitCode = 1;
