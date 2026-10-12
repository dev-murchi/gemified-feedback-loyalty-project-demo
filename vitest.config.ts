import { defineConfig } from 'vitest/config';

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
        },
      },
      {
        extends: true,
        test: { name: 'e2e', include: ['test/e2e/**/*.e2e-spec.ts'] },
      },
    ],
  },
});
