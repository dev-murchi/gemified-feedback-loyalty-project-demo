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
DEMO_DATA=true npm run start:dev   # same, with the public demo catalog loaded
npm run verify           # every quality gate, same as CI
```

API contract mock (Prism, port 4010):

```sh
docker compose --profile mock up -d mock
npm run contract:mock:check   # calls all 12 endpoints, expects a documented success status
docker compose --profile mock down
```

| Script                                                               | What it does                                                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `start:dev` / `start` / `start:debug`                                | Run the API through the NestJS CLI                                                      |
| `build`, `start:prod`                                                | Compile to `dist/` with `nest build`, run `dist/main.api.js`                            |
| `typecheck`                                                          | `tsc --noEmit`                                                                          |
| `lint`                                                               | ESLint with the rules below                                                             |
| `format`, `format:check`                                             | Prettier (ignores `docs/` and `CLAUDE.md`)                                              |
| `depcruise`                                                          | Layer and context rules with dependency-cruiser                                         |
| `contract:lint`                                                      | Redocly CLI lint of `docs/api/openapi.yaml`                                             |
| `contract:mock:check`                                                | Smoke check of the Prism mock (`scripts/check-mock.ts`)                                 |
| `test`, `test:unit`, `test:contract`, `test:integration`, `test:e2e` | Vitest projects                                                                         |
| `test:cov`                                                           | Unit and contract tests with the coverage gate                                          |
| `verify`                                                             | typecheck, lint, format check, depcruise, contract lint, coverage, e2e                  |
| `demo:snapshot`                                                      | Completes the demo catalog snapshot (ids, QR tokens) with `tsx`; keeps existing entries |

## Layout

Current:

```
src/
  main.api.ts              # API entry point
  composition/
    app.module.ts          # composition root (NestJS)
    persistence.module.ts  # event router (created first), in-memory store and unit of work, logger,
                           # start-up check that the routes were frozen
    catalog.module.ts      # Catalog wiring; demo data only with DEMO_DATA=true
    gamification.module.ts # Gamification wiring; exports the handlers and the read side
    event-routes.ts        # the only place event routes are registered; freezes the router
    event-routes.module.ts # runs event-routes.ts during start-up
    tokens.ts              # injection tokens
  shared-kernel/           # Result, typed ids, Clock, IdGenerator, RandomSource, Logger, DomainEvent,
                           # DomainError, ConcurrencyConflictError, AggregateRoot, UnitOfWork, event routing,
                           # outbox record, repository-access keys, retryOnConflict
    adapters/              # InMemoryTable, InMemoryUnitOfWork, saveVersioned, EventRouter, SystemClock,
                           # RandomIdGenerator, CryptoRandomSource, ConsoleLogger
  contexts/
    identity/                # domain/events/user-registered.ts; public/ re-exports it
    feedback/                # domain/events/feedback-validated.ts; public/ re-exports it
    catalog/
      domain/                # sector, geo-point, topic-key; brand/, branch/ (QrCode, QrToken), label-set/
      application/           # ports/ (repositories), use-cases/ (ResolveQr, ProvideLabelSet, RevokeQrCode)
      adapters/
        inbound/demo/        # demo catalog definition, generated snapshot, loader
        outbound/            # memory-*.repository.ts
      public/                # QrResolver, LabelSetProvider, CatalogSector
    gamification/
      domain/                # level-policy, reward-amounts; wallet/ (Wallet, LedgerEntry, ledger-access)
      application/           # ports/ (WalletRepository), use-cases/ (OpenWallet, AwardReward, GetWallet,
                             # LookupReward)
      adapters/outbound/     # memory-wallet.repository.ts (wallets + append-only ledger)
      public/                # RewardLookup
scripts/                   # check-mock.ts, generate-demo-catalog.ts
test/
  support/                 # fakes, builders, in-memory harnesses
  unit/                    # shared-kernel/, catalog/, gamification/, composition/
  contract/                # support/ (generic contracts), catalog/, gamification/
  e2e/                     # application-level tests
```

Target (`docs/07` §3). Each context's folders are created when that context is built, one module at a time:

```
src/
  shared-kernel/           # ports and types
    adapters/              # shared in-memory adapters (plain TypeScript)
  platform/
    http/                  # shared HTTP infrastructure (S0-05 slice 4)
  contexts/
    <context>/             # identity, catalog, feedback, analysis, gamification, insights
      domain/
        events/            # published event types
      application/
        ports/
        use-cases/
      adapters/
        inbound/
        outbound/
      public/              # the only folder other contexts may import
  composition/
  main.api.ts
  main.worker.ts           # S0-10
test/
  support/  unit/<context>/  contract/  integration/  e2e/
```

## Unit of work and domain events

How a state change and its consequences end up in one transaction (ADR-014, ADR-020):

1. A use case calls `uow.run(async () => { … })`.
2. An aggregate method records an event (`recordEvent`).
3. The repository's `save` writes the row and takes the aggregate's events with the `takeEvents` key (`aggregate[takeEvents]()`), then hands them to the unit of work (`EventCollector.collect`).
4. When the work finishes, each event is looked up in the `EventRouter`: synchronous handlers run inside the same transaction; outbox-routed events (`FeedbackSubmitted`) become outbox records. An event without a route fails the transaction.
5. If anything throws, every change is undone, outbox included.

**Event routes.** Event types are defined in the publisher's `domain/events/` (e.g. `contexts/identity/domain/events/user-registered.ts`, importing only the shared kernel) and re-exported, type only, from `<context>/public/`; consumers import them from `public/`, never copy them. `PersistenceModule` creates the `EventRouter` before the store, because the unit of work needs routes, handlers need repositories, and repositories need the unit of work. Context modules export their handlers; only `src/composition/event-routes.ts` registers them, with keys typed from the event types (`register<UserRegistered>('UserRegistered', …)` does not compile with a wrong key or handler), and then freezes the router. Registering after the freeze, or the same type twice, throws; `routeFor` refuses to answer before the freeze; start-up fails if the routes were never frozen. Handlers run inside the publisher's unit of work and never retry themselves.

`OpenWallet` is deliberately not idempotent: a retry reruns the publisher's unit of work from rolled-back state, so a second `UserRegistered` for the same user can only be a bug (e.g. a reused user id getting someone else's wallet). It throws, and the registration rolls back with it. Awards, in contrast, can legitimately be delivered twice (TC-GAM-01), so "already awarded" is `ok`.

**Conflicts and decisions.** `save` throws `ConcurrencyConflictError` on a stale version, which rolls back the whole unit of work. Use cases wrap the complete `uow.run(...)`, load included, in `retryOnConflict`; it reruns once and rethrows a second conflict (at the API: `500 INTERNAL_ERROR`, retryable). A returned `Err` does not roll back, so every decision comes before the first save, and errors inside a unit of work are never swallowed by a general `try/catch` (`docs/07` §5–6).

`InMemoryUnitOfWork` runs one unit of work at a time and restores `InMemoryTable` snapshots on failure. A handler must never call `uow.run` itself: it is already inside a run, and the in-memory version would wait on itself. `InMemoryTable` deep-copies rows on write and read (`structuredClone`), so callers never hold stored objects. Rows must be plain data: `structuredClone` silently turns class instances into plain objects, so repository contract tests check this.

## Repositories and contract tests

- **Versions (ADR-019, `docs/07` §4).** An aggregate's `version` is the stored version it is based on; 0 means never stored (new, or restored from a snapshot). `save` succeeds only if the stored version (0 when there is no row) equals it, otherwise it throws `ConcurrencyConflictError`; it writes the next version and sets it on the instance (`markSaved`), so saving the same instance twice is not a conflict. In memory, `saveVersioned` does this for every repository.
- **One contract, several adapters.** A repository contract is a function in `test/contract/<context>/` that talks only to the port and the unit of work, e.g. `branchRepositoryContract(makeHarness)`. `versionedRepositoryContract` (in `test/contract/support/`) holds the version cases every repository shares, including "a conflict on a later save undoes earlier saves of the same unit of work". `test/contract/<context>/memory-*.spec.ts` runs the contracts with an in-memory harness from `test/support/`; S0-11 runs the same functions with a PostgreSQL harness under `test/integration/`.
- **Context access keys.** Besides the shared `takeEvents` and `markSaved` keys, a context may define its own in `domain/<aggregate>/*-access.ts` (e.g. `takeNewLedgerEntries`, which the wallet repository uses to append the wallet's new ledger entries in the same step as the wallet row). Only that context's domain and outbound adapters may import them.
- **Loading for a decision.** `findWithLedgerKey(userId, key)` loads the wallet together with whether that ledger key exists; the wallet refuses to award for a key it was not loaded for. "Already awarded" returns `ok` and saves nothing. As a backstop, an existing key at insert time (the constraint `ledger_entries_idempotency_key_uq`, matched by name) becomes `ConcurrencyConflictError` with a warning log, so the retry ends with exactly one entry; no other unique violation is mapped (`docs/07` §6).
- **Inspection in harnesses.** A harness may expose read helpers that are not part of the port (e.g. `ledgerOf`), so contracts can check stored state; the PostgreSQL harness provides the same helpers.
- **Test data** comes from builders in `test/support/` (e.g. `aBranch()`), never from the demo loader.

## Logging

Adapters log through the shared-kernel `Logger` port (`warn(message, fields)`), never `console` or a framework logger directly. `ConsoleLogger` writes one JSON line; fields come first, so they can never overwrite `level` or `message`. No personal data or feedback text in fields (T-I4). Tests assert log entries with the `RecordingLogger` fake (`docs/07` §6).

## Rules and how they are enforced

| Rule                                                                                                                                                | Tool                                                             | Where                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Domain imports only its own domain and the shared kernel (no packages, no Node built-ins)                                                           | dependency-cruiser `domain-is-pure`                              | `.dependency-cruiser.cjs`               |
| Application imports only its own domain/application, the shared kernel and other contexts' `public/`                                                | dependency-cruiser `application-has-no-infrastructure`           | `.dependency-cruiser.cjs`               |
| A context reaches another context only through its `public/` folder                                                                                 | dependency-cruiser `only-public-across-contexts`                 | `.dependency-cruiser.cjs`               |
| The shared kernel imports nothing outside itself                                                                                                    | dependency-cruiser `shared-kernel-is-pure`                       | `.dependency-cruiser.cjs`               |
| Domain, application and the shared kernel's ports never import `shared-kernel/adapters/`                                                            | dependency-cruiser `core-does-not-use-shared-adapters`           | `.dependency-cruiser.cjs`               |
| An aggregate's events can be taken only in outbound repository adapters                                                                             | dependency-cruiser `repository-access-only-in-outbound-adapters` | `.dependency-cruiser.cjs`               |
| Demo data (`adapters/inbound/demo/`) is imported only by the composition root                                                                       | dependency-cruiser `demo-data-only-from-composition`             | `.dependency-cruiser.cjs`               |
| Demo data is never loaded in production (`DEMO_DATA=true` with `NODE_ENV=production` fails startup)                                                 | `isDemoDataEnabled` + e2e test                                   | `src/composition/demo-data.ts`          |
| A context's access keys (`*-access.ts`) only in its own domain and outbound adapters                                                                | dependency-cruiser `context-access-only-in-domain-and-outbound`  | `.dependency-cruiser.cjs`               |
| Event files (`domain/events/`) import only the shared kernel                                                                                        | dependency-cruiser `domain-events-only-shared-kernel`            | `.dependency-cruiser.cjs`               |
| Event routes are registered only in `src/composition/event-routes.ts` and frozen before serving                                                     | Start-up check (`EVENT_ROUTES_CHECK`) + code review              | `src/composition/persistence.module.ts` |
| Adapters log only through the `Logger` port, without personal data                                                                                  | Code review                                                      | `docs/07` §6                            |
| No circular dependencies                                                                                                                            | dependency-cruiser `no-circular`                                 | `.dependency-cruiser.cjs`               |
| Complexity ≤ 9, depth 3, params 3, function ≤ 40 lines (not in tests), file ≤ 300 lines, 1 class per file, no `any`, no `!`                         | ESLint + typescript-eslint (type-aware)                          | `eslint.config.mjs`                     |
| `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`                              | TypeScript                                                       | `tsconfig.json`                         |
| Shared kernel + domain + application line coverage ≥ 80 %                                                                                           | Vitest coverage (v8)                                             | `vitest.config.ts`                      |
| No high or critical dependency vulnerabilities                                                                                                      | `npm audit --audit-level=high`                                   | `.github/workflows/ci.yml`              |
| The API contract lints without errors or warnings (`recommended` rules; `info-license` and `no-server-example.com` turned off, reasons in the file) | Redocly CLI                                                      | `redocly.yaml`                          |

NestJS appears only in `adapters/` and `composition/` (ADR-021); dependency-cruiser fails the build otherwise.

## Tests

- Vitest with globals enabled. Four projects in `vitest.config.ts`: `unit`, `contract` and `integration` run `test/<level>/**/*.spec.ts`; `e2e` runs `test/e2e/**/*.e2e-spec.ts`.
- Coverage is measured only on `src/shared-kernel`, `src/*/domain` and `src/*/application`.
- Fakes, not mocks, for ports; `FakeClock` for time; Given / When / Then (`docs/07` §9).

## NestJS CLI conventions

Generate NestJS files with the CLI, then adjust them to the layout above. Spec files are turned off in `nest-cli.json` because tests live under `test/`.

```sh
npx nest g module catalog composition --flat                     # src/composition/catalog.module.ts, registered in AppModule
npx nest g controller feedback contexts/feedback/adapters/inbound/http --flat  # src/contexts/feedback/adapters/inbound/http/feedback.controller.ts
```

Use cases and ports are plain TypeScript; they are wired into NestJS in `composition/` with factory providers (`docs/07` §2).

## Decisions made during development

| Decision                                                                                           | Reason                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESM project (`"type": "module"`, `module: nodenext`)                                               | NestJS 12 is ESM-only                                                                                                                                                                      |
| Vitest instead of Jest (`docs/07` v1.1, `docs/04` v1.3)                                            | Native ESM support                                                                                                                                                                         |
| Vitest 5 rather than the 4.1 generated by `nest new`                                               | npm 10 crashes resolving Vitest 4.1's optional peer dependencies                                                                                                                           |
| ESLint + typescript-eslint rather than the oxlint generated by `nest new`                          | `docs/07` §8; type-aware rules such as `no-floating-promises`                                                                                                                              |
| TypeScript `~6.0`                                                                                  | typescript-eslint 8.71 supports TypeScript < 6.1                                                                                                                                           |
| Node ≥ 22.22.3                                                                                     | Required by `@angular-devkit/schematics`, used by `@nestjs/schematics`                                                                                                                     |
| `postgres:14-alpine`, `redis:7.2-alpine`                                                           | Images already available on the development machine. PostgreSQL 14 reaches end of life in November 2026; upgrading is a one-line change. Redis runs with `noeviction` for BullMQ (ADR-011) |
| dependency-cruiser `shared-kernel-is-pure` (`docs/07` v1.1)                                        | Every domain imports the shared kernel, so its purity protects all of them                                                                                                                 |
| Prism runs from the `stoplight/prism:5.15.10` Docker image, not npm                                | Prism ≥ 5.15.7 needs Node ≥ 24.14; the image keeps it out of our dependencies and `npm audit`. The image is amd64-only, so it runs under emulation on Apple Silicon                        |
| Prism started with `-m false`                                                                      | Prism 5.15.10 crashes in its default multiprocess mode                                                                                                                                     |
| QR tokens are 16 random bytes (22 base64url characters)                                            | The FR-QR-01 minimum (128 bits); shortest QR content                                                                                                                                       |
| Demo QR codes are a committed snapshot, restored with `Branch.reconstitute`                        | Printed QR codes must stay valid across restarts and the PostgreSQL switch; `Branch.issueQrCode` stays the only way to make a token                                                        |
| `tsx` runs TypeScript scripts (`npm run demo:snapshot`)                                            | Plain Node cannot resolve our `./x.js` imports to `.ts` files                                                                                                                              |
| Composition wires use cases with factory providers and symbol tokens (`src/composition/tokens.ts`) | No dependence on decorator metadata (`docs/07` §2)                                                                                                                                         |
| S0-06 (Gamification) before S0-05 (Identity)                                                       | Owner decision: every user has a wallet from the moment they exist; the publishers' event contracts are written first                                                                      |
| `fast-check` for TC-GAM-04                                                                         | Generates and shrinks operation sequences; the seed is printed on failure                                                                                                                  |
| Each ledger entry stores `xpTotalAfter` (SDD v1.2)                                                 | A feedback's level-up is derived from a fact that never changes                                                                                                                            |
| A ledger entry's earning date is the feedback's `submittedAt`                                      | Points expiry counts from the customer's visit, and it is identical across retries                                                                                                         |
| Only the named ledger-key constraint maps to `ConcurrencyConflictError`                            | A duplicate reward key is a concurrency symptom; every other unique violation is an infrastructure error                                                                                   |
| Contexts under `src/contexts/`                                                                     | Rules match contexts by path; shared folders (`shared-kernel/`, `platform/`, `composition/`) never need exceptions                                                                         |

## Known gaps

- Vitest's default transformer may not emit decorator metadata. A NestJS provider that relies on class-based injection inside a Vitest test may need `unplugin-swc`. Factory providers avoid this.
