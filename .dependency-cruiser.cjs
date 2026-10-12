// Layer and context rules from docs/07-muhendislik-standartlari.md §2 and §8.
// Bounded contexts live in src/contexts/<context>/; everything else under src/ is shared or wiring.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/domain/' },
      to: { pathNot: ['^src/contexts/$1/domain/', '^src/shared-kernel/'] },
    },
    {
      name: 'application-has-no-infrastructure',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/application/' },
      to: {
        pathNot: [
          '^src/contexts/$1/(domain|application)/',
          '^src/shared-kernel/',
          '^src/contexts/[^/]+/public/',
        ],
      },
    },
    {
      name: 'only-public-across-contexts',
      severity: 'error',
      from: { path: '^src/contexts/([^/]+)/' },
      to: {
        path: '^src/contexts/',
        pathNot: ['^src/contexts/$1/', '^src/contexts/[^/]+/public/'],
      },
    },
    {
      name: 'shared-kernel-is-pure',
      severity: 'error',
      from: { path: '^src/shared-kernel/' },
      to: { pathNot: '^src/shared-kernel/' },
    },
    {
      name: 'core-does-not-use-shared-adapters',
      severity: 'error',
      from: {
        path: [
          '^src/contexts/[^/]+/(domain|application)/',
          '^src/shared-kernel/(?!adapters/)',
        ],
      },
      to: { path: '^src/shared-kernel/adapters/' },
    },
    {
      name: 'repository-access-only-in-outbound-adapters',
      severity: 'error',
      from: {
        pathNot: [
          '^src/shared-kernel/aggregate-root\\.ts$',
          '^src/contexts/[^/]+/adapters/outbound/',
          '^src/shared-kernel/adapters/',
        ],
      },
      to: { path: '^src/shared-kernel/repository-access\\.ts$' },
    },
    {
      name: 'demo-data-only-from-composition',
      severity: 'error',
      from: {
        pathNot: [
          '^src/composition/',
          '^src/contexts/[^/]+/adapters/inbound/demo/',
        ],
      },
      to: { path: '^src/contexts/[^/]+/adapters/inbound/demo/' },
    },
    {
      name: 'context-access-only-in-domain-and-outbound',
      severity: 'error',
      from: {
        path: '^src/',
        pathNot: [
          '^src/contexts/[^/]+/domain/',
          '^src/contexts/[^/]+/adapters/outbound/',
        ],
      },
      to: { path: '^src/contexts/[^/]+/domain/.+-access\\.ts$' },
    },
    {
      name: 'domain-events-only-shared-kernel',
      severity: 'error',
      from: { path: '^src/contexts/[^/]+/domain/events/' },
      to: { pathNot: '^src/shared-kernel/' },
    },
    {
      name: 'platform-imports-no-context',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/', pathNot: ['^src/platform/', '^src/shared-kernel/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
    },
  },
};
