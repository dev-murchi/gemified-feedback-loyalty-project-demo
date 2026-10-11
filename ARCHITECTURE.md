# Architecture

Backend for the gamified, AI-assisted feedback and loyalty engine. This file describes the code **as implemented**: how to run it, how it is laid out and which tool enforces which rule. The design itself lives in `docs/` (Turkish) and is the source of truth:

| Topic                                                     | Document                                  |
| --------------------------------------------------------- | ----------------------------------------- |
| Requirements                                              | `docs/01-gereksinim-dokumani-SRS.md`      |
| Architecture decisions (ADR), data model, security, AI    | `docs/02-yazilim-tasarim-dokumani-SDD.md` |
| Bounded contexts, ubiquitous language, aggregates, events | `docs/06-alan-modeli.md`                  |
| Coding rules and quality gates                            | `docs/07-muhendislik-standartlari.md`     |
| Work order                                                | `docs/08-sprint-0-backlog.md`             |
| API contract                                              | `docs/api/openapi.yaml`                   |

This file grows as each module is built.

## Running locally

Requirements: Node.js 22 (at least 22.22.3; see `.nvmrc`), npm, Docker.

```sh
nvm use                  # Node 22 from .nvmrc
npm ci
cp .env.example .env     # read by docker compose
docker compose up -d     # PostgreSQL and Redis (not used by the app yet)
npm run start:dev        # API with watch mode, http://localhost:3000
npm run verify           # every quality gate, same as CI
```

API contract mock (Prism, port 4010):

```sh
docker compose --profile mock up -d mock
npm run contract:mock:check   # calls all 12 endpoints, expects a documented success status
docker compose --profile mock down
```

| Script                                                               | What it does                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `start:dev` / `start` / `start:debug`                                | Run the API through the NestJS CLI                                     |
| `build`, `start:prod`                                                | Compile to `dist/` with `nest build`, run `dist/main.api.js`           |
| `typecheck`                                                          | `tsc --noEmit`                                                         |
| `lint`                                                               | ESLint with the rules below                                            |
| `format`, `format:check`                                             | Prettier (ignores `docs/` and `CLAUDE.md`)                             |
| `depcruise`                                                          | Layer and context rules with dependency-cruiser                        |
| `contract:lint`                                                      | Redocly CLI lint of `docs/api/openapi.yaml`                            |
| `contract:mock:check`                                                | Smoke check of the Prism mock (`scripts/check-mock.ts`)                |
| `test`, `test:unit`, `test:contract`, `test:integration`, `test:e2e` | Vitest projects                                                        |
| `test:cov`                                                           | Unit and contract tests with the coverage gate                         |
| `verify`                                                             | typecheck, lint, format check, depcruise, contract lint, coverage, e2e |

## Layout

Current:

```
src/
  main.api.ts              # API entry point
  composition/
    app.module.ts          # composition root (NestJS)
test/
  e2e/                     # HTTP-level tests
```

Target (`docs/07` §3). Each context's folders are created when that context is built, one module at a time:

```
src/
  shared-kernel/           # typed ids, Clock, Result, DomainEvent, DomainError, UnitOfWork
  <context>/               # identity, catalog, feedback, analysis, gamification, insights
    domain/
    application/
      ports/
    adapters/
      inbound/
      outbound/
    public/                # the only folder other contexts may import
  composition/
  main.api.ts
  main.worker.ts           # S0-10
test/
  unit/<context>/  contract/  integration/  e2e/
```

## Rules and how they are enforced

| Rule                                                                                                                                                | Tool                                                   | Where                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------- |
| Domain imports only its own domain and the shared kernel (no packages, no Node built-ins)                                                           | dependency-cruiser `domain-is-pure`                    | `.dependency-cruiser.cjs`  |
| Application imports only its own domain/application, the shared kernel and other contexts' `public/`                                                | dependency-cruiser `application-has-no-infrastructure` | `.dependency-cruiser.cjs`  |
| A context reaches another context only through its `public/` folder                                                                                 | dependency-cruiser `only-public-across-contexts`       | `.dependency-cruiser.cjs`  |
| The shared kernel imports nothing outside itself                                                                                                    | dependency-cruiser `shared-kernel-is-pure`             | `.dependency-cruiser.cjs`  |
| No circular dependencies                                                                                                                            | dependency-cruiser `no-circular`                       | `.dependency-cruiser.cjs`  |
| Complexity ≤ 9, depth 3, params 3, function ≤ 40 lines (not in tests), file ≤ 300 lines, 1 class per file, no `any`, no `!`                         | ESLint + typescript-eslint (type-aware)                | `eslint.config.mjs`        |
| `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`                              | TypeScript                                             | `tsconfig.json`            |
| Domain + application line coverage ≥ 80 %                                                                                                           | Vitest coverage (v8)                                   | `vitest.config.ts`         |
| No high or critical dependency vulnerabilities                                                                                                      | `npm audit --audit-level=high`                         | `.github/workflows/ci.yml` |
| The API contract lints without errors or warnings (`recommended` rules; `info-license` and `no-server-example.com` turned off, reasons in the file) | Redocly CLI                                            | `redocly.yaml`             |

NestJS appears only in `adapters/` and `composition/` (ADR-021); dependency-cruiser fails the build otherwise.

## Tests

- Vitest with globals enabled. Four projects in `vitest.config.ts`: `unit`, `contract` and `integration` run `test/<level>/**/*.spec.ts`; `e2e` runs `test/e2e/**/*.e2e-spec.ts`.
- Coverage is measured only on `src/*/domain` and `src/*/application`.
- Fakes, not mocks, for ports; `FakeClock` for time; Given / When / Then (`docs/07` §9).

## NestJS CLI conventions

Generate NestJS files with the CLI, then adjust them to the layout above. Spec files are turned off in `nest-cli.json` because tests live under `test/`.

```sh
npx nest g module catalog composition --flat                     # src/composition/catalog.module.ts, registered in AppModule
npx nest g controller feedback feedback/adapters/inbound --flat  # src/feedback/adapters/inbound/feedback.controller.ts
```

Use cases and ports are plain TypeScript; they are wired into NestJS in `composition/` with factory providers (`docs/07` §2).

## Decisions made during development

| Decision                                                                  | Reason                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESM project (`"type": "module"`, `module: nodenext`)                      | NestJS 12 is ESM-only                                                                                                                                                                      |
| Vitest instead of Jest (`docs/07` v1.1, `docs/04` v1.3)                   | Native ESM support                                                                                                                                                                         |
| Vitest 5 rather than the 4.1 generated by `nest new`                      | npm 10 crashes resolving Vitest 4.1's optional peer dependencies                                                                                                                           |
| ESLint + typescript-eslint rather than the oxlint generated by `nest new` | `docs/07` §8; type-aware rules such as `no-floating-promises`                                                                                                                              |
| TypeScript `~6.0`                                                         | typescript-eslint 8.71 supports TypeScript < 6.1                                                                                                                                           |
| Node ≥ 22.22.3                                                            | Required by `@angular-devkit/schematics`, used by `@nestjs/schematics`                                                                                                                     |
| `postgres:14-alpine`, `redis:7.2-alpine`                                  | Images already available on the development machine. PostgreSQL 14 reaches end of life in November 2026; upgrading is a one-line change. Redis runs with `noeviction` for BullMQ (ADR-011) |
| dependency-cruiser `shared-kernel-is-pure` (`docs/07` v1.1)               | Every domain imports the shared kernel, so its purity protects all of them                                                                                                                 |
| Prism runs from the `stoplight/prism:5.15.10` Docker image, not npm       | Prism ≥ 5.15.7 needs Node ≥ 24.14; the image keeps it out of our dependencies and `npm audit`. The image is amd64-only, so it runs under emulation on Apple Silicon                        |
| Prism started with `-m false`                                             | Prism 5.15.10 crashes in its default multiprocess mode                                                                                                                                     |

## Known gaps

- The coverage threshold has not yet been seen failing a run: with no domain or application files it reports 0/0 and passes. To be proven in S0-03.
- Vitest's default transformer may not emit decorator metadata. A NestJS provider that relies on class-based injection inside a Vitest test may need `unplugin-swc`. Factory providers avoid this.
