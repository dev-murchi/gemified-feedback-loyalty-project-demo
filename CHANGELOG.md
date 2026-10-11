# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). There are no releases yet; entries reference backlog items in `docs/08-sprint-0-backlog.md`.

## [Unreleased]

### Added

- S0-01: Project scaffolded with the NestJS 12 CLI as an ESM project on Node.js 22 and TypeScript 6.0.
- S0-01: Quality gates: TypeScript strict with four extra flags; ESLint with typescript-eslint (complexity ≤ 9 and the size rules of `docs/07` §8); Prettier; dependency-cruiser with five layer and context rules; Vitest with unit, contract, integration and e2e projects and an 80 % line coverage gate on domain and application code.
- S0-01: Empty API entry point (`src/main.api.ts`) and composition root (`src/composition/app.module.ts`), with an e2e test that boots the application.
- S0-01: Docker Compose for PostgreSQL 14 and Redis 7.2 (`noeviction`).
- S0-01: GitHub Actions workflow running every quality gate and `npm audit --audit-level=high`.
- `ARCHITECTURE.md` and this changelog.
- S0-02: API contract lint with Redocly CLI (`npm run contract:lint`, also in CI and `verify`).
- S0-02: Prism mock server for the API contract (`docker compose --profile mock up -d mock`) and a smoke check that calls all 12 endpoints (`npm run contract:mock:check`).
- S0-03: Shared kernel: `Result` with `map`/`andThen`, branded typed ids (`UserId`, `BrandId`, `BranchId`, `FeedbackId`), `Clock` and `IdGenerator` ports, `DomainEvent`, `DomainError`, `ConcurrencyConflict`, `AggregateRoot`, the `UnitOfWork` port with event routing and outbox records.
- S0-03: `InMemoryUnitOfWork` and `InMemoryTable`: synchronous event handlers in the same unit of work, outbox records for outbox-routed events, full rollback on any failure; `SystemClock`, `RandomIdGenerator`; test support `FakeClock` and `SequentialIdGenerator`.
- S0-03: dependency-cruiser rule `core-does-not-use-shared-adapters`; coverage gate now includes the shared kernel.

### Changed

- Shared kernel review fixes: an aggregate's recorded events can only be taken with the `takeEvents` key from `src/shared-kernel/repository-access.ts` (replaces the public `pullEvents()`), and dependency-cruiser rule `repository-access-only-in-outbound-adapters` limits that import to outbound repository adapters. `InMemoryTable` deep-copies rows on write and read, so changing a saved or loaded object no longer changes stored state.
- `docs/07` v1.3: `takeEvents` key and `repository-access-only-in-outbound-adapters` rule; in-memory tables copy rows, rows are plain data (checked by repository contract tests); after a successful save the repository sets the instance's version to the stored version (`markSaved`, implemented in S0-04).
- `docs/07` v1.2: `shared-kernel/adapters/` and `test/support/` folders, `core-does-not-use-shared-adapters` rule.
- API contract 0.2.1-demo: description for the `Cüzdan` tag. No endpoint or schema changes.
- `docs/07` v1.1 and `docs/04` v1.3: Vitest replaces Jest; `docs/07` adds the `shared-kernel-is-pure` dependency rule.

### Removed

- The code of the first Sprint 0 attempt; development restarted from scratch on 11 October 2026.
