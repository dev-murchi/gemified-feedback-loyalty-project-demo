import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { startRedis } from '../support/redis-server.js';

declare module 'vitest' {
  export interface ProvidedContext {
    /** docs/api/openapi.yaml, bundled with every $ref resolved, as JSON. */
    contractPath: string;
  }
}

/**
 * Bundles docs/api/openapi.yaml once for the whole e2e run, with the Redocly CLI we already use for
 * `contract:lint`, so the tests can read the contract without a YAML parser. Also starts the one
 * Redis server of the run (each file takes a database of its own, test/support/redis.ts), so a slow
 * container start cannot fail one test file.
 */
export default async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const directory = mkdtempSync(join(tmpdir(), 'openapi-'));
  const output = join(directory, 'openapi.json');
  execFileSync(
    'node_modules/.bin/redocly',
    [
      'bundle',
      'docs/api/openapi.yaml',
      '--dereferenced',
      '--ext',
      'json',
      '-o',
      output,
    ],
    {
      env: {
        ...process.env,
        REDOCLY_TELEMETRY: 'off',
        REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true',
      },
      stdio: 'pipe',
    },
  );
  project.provide('contractPath', output);
  const redis = await startRedis();
  project.provide('redisUrl', redis.getConnectionUrl());
  return async () => {
    await redis.stop();
    rmSync(directory, { recursive: true, force: true });
  };
}
