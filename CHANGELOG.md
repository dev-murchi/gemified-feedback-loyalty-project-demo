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
- S0-04: Catalog context: `Brand`, `Branch` with `QrCode` entities, `LabelSet`; `QrToken` generated from 16 bytes of an injected `RandomSource` (FR-QR-01); `RevokeQrCode`; `QrResolver` and `LabelSetProvider` open host services (unknown, revoked or malformed tokens give `QR_INVALID`, FR-QR-02); in-memory repositories.
- S0-04: Repository contract tests: a generic `versionedRepositoryContract` (version 0 insert, save twice, stale conflict, rollback) used by the Brand, Branch and LabelSet contracts, run against the in-memory adapters; Catalog test builders in `test/support/`.
- S0-04: Shared kernel: `markSaved` key, `RandomSource` port with `CryptoRandomSource`, `saveVersioned` for in-memory repositories, `retryOnConflict`; `Brand` type helper renamed to `Branded`.
- S0-04: Demo catalog (2 brands, 10 branches, S-4 label sets) under `src/catalog/adapters/inbound/demo/`, with a re-runnable snapshot generator (`npm run demo:snapshot`, `tsx`); loaded by the composition root only with `DEMO_DATA=true`, and startup fails with `NODE_ENV=production`. dependency-cruiser rule `demo-data-only-from-composition`.
- S0-04: Composition: `PersistenceModule` (shared in-memory store and unit of work) and `CatalogModule`, generated with the Nest CLI and wired with factory providers.

### Changed

- `docs/07` v1.8 and `docs/08`: context-specific access keys (`*-access.ts`) with the `context-access-only-in-domain-and-outbound` rule; event routes are registered only in `src/composition/event-routes.ts` and frozen afterwards; the `UserRegistered` → `OpenWallet` wiring moves back into S0-06.
- SDD v1.2 (development-time change, S0-06): `LEDGER_ENTRIES.xp_total_after` stores the total XP after each entry, so a feedback's level-up (FR-GAM-05) is derived from a fact that never changes; references to SDD v1.1 updated.
- `docs/07` v1.7: only the ledger idempotency-key constraint, matched by name, becomes `ConcurrencyConflictError`; every other unique violation stays an infrastructure error. `docs/08` S0-11: the PostgreSQL adapter maps only that named constraint.
- `docs/08`: S0-06 (Gamification) now comes before S0-05 (Identity), owner decision: every user has a wallet from the moment they exist. S0-06 writes the publishers' event contracts first (`UserRegistered`, `FeedbackValidated`, types only); `/v1/me/wallet` and the user + wallet transaction test move to S0-05.
- S0-04 review: concurrency conflicts are thrown (`ConcurrencyConflictError`) and roll back the unit of work; `retryOnConflict` reruns the whole unit of work once and rethrows a second conflict; repository `save` returns `Promise<void>`. New contract case: a conflict on a later save undoes earlier saves.
- S0-04 review: `Branch` copies QR code dates in and out; revoking an already revoked code returns ok and stores nothing; the demo loader validates snapshot ids; loader and generator refuse snapshot entries without a definition.
- `docs/07` v1.6: conflicts are thrown and roll back the unit of work; decisions before the first save; no general try/catch inside a unit of work.
- `docs/07` v1.5: version 0 rule (never-stored aggregate; insert when there is no row), `adapters/inbound/demo/` folder and `demo-data-only-from-composition` rule.
- `docs/07` v1.4: domain code is grouped by aggregate (`domain/<aggregate>/`), use cases live in `application/use-cases/`.
- Shared kernel review fixes: an aggregate's recorded events can only be taken with the `takeEvents` key from `src/shared-kernel/repository-access.ts` (replaces the public `pullEvents()`), and dependency-cruiser rule `repository-access-only-in-outbound-adapters` limits that import to outbound repository adapters. `InMemoryTable` deep-copies rows on write and read, so changing a saved or loaded object no longer changes stored state.
- `docs/07` v1.3: `takeEvents` key and `repository-access-only-in-outbound-adapters` rule; in-memory tables copy rows, rows are plain data (checked by repository contract tests); after a successful save the repository sets the instance's version to the stored version (`markSaved`, implemented in S0-04).
- `docs/07` v1.2: `shared-kernel/adapters/` and `test/support/` folders, `core-does-not-use-shared-adapters` rule.
- API contract 0.2.1-demo: description for the `Cüzdan` tag. No endpoint or schema changes.
- `docs/07` v1.1 and `docs/04` v1.3: Vitest replaces Jest; `docs/07` adds the `shared-kernel-is-pure` dependency rule.

### Removed

- The code of the first Sprint 0 attempt; development restarted from scratch on 11 October 2026.
