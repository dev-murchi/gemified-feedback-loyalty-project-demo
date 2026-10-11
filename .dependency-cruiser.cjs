// Layer and context rules from docs/07-muhendislik-standartlari.md §2 and §8.
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
      from: { path: '^src/([^/]+)/domain/' },
      to: { pathNot: ['^src/$1/domain/', '^src/shared-kernel/'] },
    },
    {
      name: 'application-has-no-infrastructure',
      severity: 'error',
      from: { path: '^src/([^/]+)/application/' },
      to: {
        pathNot: [
          '^src/$1/(domain|application)/',
          '^src/shared-kernel/',
          '^src/[^/]+/public/',
        ],
      },
    },
    {
      name: 'only-public-across-contexts',
      severity: 'error',
      from: {
        path: '^src/([^/]+)/',
        pathNot: '^src/(composition|shared-kernel)/',
      },
      to: {
        path: '^src/[^/]+/',
        pathNot: ['^src/$1/', '^src/shared-kernel/', '^src/[^/]+/public/'],
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
          '^src/[^/]+/(domain|application)/',
          '^src/shared-kernel/(?!adapters/)',
        ],
      },
      to: { path: '^src/shared-kernel/adapters/' },
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
