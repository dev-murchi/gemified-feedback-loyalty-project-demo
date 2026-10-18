import { defineConfig } from 'vitest/config';

// Tests that start a container (Testcontainers) wait for the image and the container; Ryuk, the
// Testcontainers cleanup container, removes them even when a run is killed.
const CONTAINER_TESTS = {
  hookTimeout: 120_000,
  testTimeout: 30_000,
};

// Test levels from docs/04-test-stratejisi.md §2; coverage gate from docs/07 §8.
export default defineConfig({
  test: {
    globals: true,
    root: './',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/shared-kernel/**/*.ts',
        'src/contexts/*/domain/**/*.ts',
        'src/contexts/*/application/**/*.ts',
      ],
      thresholds: { lines: 80 },
      reporter: ['text', 'lcov'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: { name: 'contract', include: ['test/contract/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.spec.ts'],
          // One PostgreSQL server with the migrated schema as a template for every file.
          globalSetup: ['test/integration/global-setup.ts'],
          ...CONTAINER_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          // Bundles docs/api/openapi.yaml once; every e2e response is checked against it.
          globalSetup: ['test/e2e/global-setup.ts'],
          setupFiles: ['test/e2e/setup.ts'],
          ...CONTAINER_TESTS,
        },
      },
    ],
  },
});
