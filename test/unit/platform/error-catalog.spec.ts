import { readFileSync } from 'node:fs';
import {
  ERROR_STATUS,
  ERROR_TITLE,
  isErrorCode,
} from '../../../src/platform/http/error-codes.js';

const contract = readFileSync('docs/api/openapi.yaml', 'utf8');

/** `| \`CODE\` | 422 | …` rows of the error catalog in the API description. */
const catalogRows = [
  ...contract.matchAll(/^\s+\| `([A-Z_]+)` \| (\d{3}) \|/gm),
];
const catalog = new Map(
  catalogRows.map(([, code, status]) => [code, Number(status)]),
);

/** The `ErrorCode` enum under components/schemas. */
const enumCodes = (() => {
  const start = contract.indexOf('    ErrorCode:');
  const end = contract.indexOf('\n\n', start);
  return [...contract.slice(start, end).matchAll(/^\s+- ([A-Z_]+)$/gm)].map(
    ([, code]) => code,
  );
})();

/** `status: 403` followed by `code: KEY_REVOKED` in the Problem examples. */
const exampleProblems = [
  ...contract.matchAll(/status: (\d{3})\n\s+code: ([A-Z_]+)/g),
].map(([, status, code]) => [code, Number(status)] as const);

describe('error code → HTTP status table', () => {
  it('has exactly the codes of the contract error catalog, with the same statuses', () => {
    // Given the catalog parsed from docs/api/openapi.yaml
    expect(catalog.size).toBe(17);

    // When compared with the table
    // Then both have the same codes and statuses
    expect(new Map(Object.entries(ERROR_STATUS))).toEqual(catalog);
  });

  it('has exactly the codes of the ErrorCode enum', () => {
    expect([...enumCodes].sort()).toEqual(Object.keys(ERROR_STATUS).sort());
  });

  it('has a title for every code', () => {
    expect(Object.keys(ERROR_TITLE).sort()).toEqual(
      Object.keys(ERROR_STATUS).sort(),
    );
    for (const title of Object.values(ERROR_TITLE)) {
      expect(title.trim()).not.toBe('');
    }
  });

  it('agrees with every Problem example in the contract', () => {
    expect(exampleProblems.length).toBeGreaterThan(0);
    for (const [code, status] of exampleProblems) {
      expect(ERROR_STATUS[code as keyof typeof ERROR_STATUS]).toBe(status);
    }
  });

  it('answers 429 only for RATE_LIMITED, so business rejections are never auto-retried', () => {
    const with429 = Object.entries(ERROR_STATUS)
      .filter(([, status]) => status === 429)
      .map(([code]) => code);
    expect(with429).toEqual(['RATE_LIMITED']);
    expect(ERROR_STATUS.REWARD_COOLDOWN).toBe(422);
    expect(ERROR_STATUS.ATTEMPTS_EXHAUSTED).toBe(422);
  });

  it('recognises only catalog codes', () => {
    expect(isErrorCode('KEY_REVOKED')).toBe(true);
    expect(isErrorCode('toString')).toBe(false);
    expect(isErrorCode('SOMETHING_ELSE')).toBe(false);
  });
});
