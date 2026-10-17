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
JWT_PRIVATE_KEY="$(…)" JWT_KEY_ID=k1 npm run start:dev   # fixed signing key (see .env.example); without it a key is generated per process outside production
RAW_TEXT_KEY="$(openssl rand -base64 32)" RAW_TEXT_KEY_ID=k1 npm run start:dev   # fixed raw-text key; without it one is generated per process outside production
LLM_DRIVER=openai OPENAI_API_KEY=… OPENAI_MODEL=… npm run start:dev   # real provider; without LLM_DRIVER the demo stand-in labels everything valid
B2B_DEMO_CLIENTS='[{"clientId":"fuel-panel","brand":"fuel","secret":"…","scope":"b2b.feedback.read b2b.summary.read"}]' DEMO_DATA=true npm run start:dev   # demo brand panels; see .env.example (B2B_JWT_PRIVATE_KEY, B2B_JWT_KEY_ID for a fixed key)
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
    persistence.module.ts  # event router (created first), clock, in-memory store and unit of work, logger,
                           # start-up check that the routes were frozen
    catalog.module.ts      # Catalog wiring; demo data only with DEMO_DATA=true
    gamification.module.ts # Gamification wiring; exports the handlers and the read side
    identity.module.ts     # Identity wiring: dev verifiers, signing key, tokens, use cases, controllers
    authentication.module.ts # the Authenticator behind BearerAuthGuard, over AuthenticateRequest
    wallet-http.module.ts  # GET /v1/me/wallet: Gamification's controller behind the guard
    feedback.module.ts     # Feedback wiring: repositories, raw-text cipher and key, use cases, controller
    analysis.module.ts     # Analysis wiring: repository, analyzer from LLM_DRIVER, ProcessAnalysisJob, UnanalyzedReport
    sentiment-analyzer-driver.ts # LLM_DRIVER: openai or the demo fake (refused in production)
    insights.module.ts     # Insights wiring: clients, scrypt, B2B key and tokens, read model, use cases, audit, controllers
    memory-reporting-queries.ts # the in-memory read model: reads Catalog, Feedback and Analysis tables (docs/06 §3, Insights → Feedback, Catalog: conformist read model)
    demo-b2b-clients.ts    # B2B_DEMO_CLIENTS: needs DEMO_DATA=true, refused in production
    configure-app.ts       # HTTP set-up shared by main.api.ts and the e2e tests
    event-routes.ts        # the only place event routes are registered; freezes the router
    event-routes.module.ts # runs event-routes.ts during start-up
    tokens.ts              # injection tokens
  shared-kernel/           # Result, typed ids, Clock, IdGenerator, RandomSource, Logger, DomainEvent,
                           # DomainError, ConcurrencyConflictError, AggregateRoot, UnitOfWork, event routing,
                           # outbox record, repository-access keys, retryOnConflict
    adapters/              # InMemoryTable, InMemoryUnitOfWork, saveVersioned, EventRouter, SystemClock,
                           # RandomIdGenerator, CryptoRandomSource, ConsoleLogger
  platform/
    http/                  # error-codes (status table, titles), problem-details, problem-exception,
                           # problem.filter, request-id, bearer-auth.guard, client-auth.guard, configure-http,
                           # parse-body, raw-body
  contexts/
    identity/
      domain/                # challenge/ (Nonce, Challenge), user/ (User, DeviceKey, trust level, key values),
                             # session/ (token claims), events/user-registered.ts, attestation errors
      application/           # ports/ (UserRepository, ChallengeStore, AttestationVerifier, SessionProofVerifier,
                             # AccessTokenIssuer, AccessTokenVerifier), use-cases/ (CreateChallenge, RegisterDevice,
                             # CreateSession, AuthenticateRequest), take-live-nonce, session-grant
      adapters/
        inbound/http/        # challenge and session controllers, Zod schemas, SessionWalletReader
        outbound/            # memory user repository and challenge store, dev verifiers, jose tokens, signing key
      public/                # UserRegistered, PlatformProofVerifier
    feedback/
      domain/                # feedback-text, idempotency-key, request-fingerprint; feedback/ (Feedback, status,
                             # raw text, errors), reward-cooldown/ (RewardCooldown, RewardLimits, rejections),
                             # events/ (FeedbackSubmitted, FeedbackValidated)
      application/           # ports/ (FeedbackRepository, RewardCooldownRepository, RawTextCipher, Hasher),
                             # use-cases/ (SubmitFeedback, GetFeedbackStatus, ApplyAnalysisResult,
                             # FinalizeUnanalyzedFeedback), save-closed-feedback
      adapters/
        inbound/http/        # FeedbackController (POST /v1/feedbacks, GET /v1/feedbacks/{id}), Zod schema
        outbound/            # memory repositories, LocalRawTextCipher, raw-text key, NodeHasher
      public/                # FeedbackSubmitted, FeedbackValidated, RawTextSource
    analysis/
      domain/                # sentiment, spam-reason; pre-check/ (PreChecks, PreCheckRules), masking/ (PiiMasker,
                             # MaskedText, checksums), retry/ (RetryPolicy), feedback-analysis/ (FeedbackAnalysis,
                             # results, parseLlmOutput), events/feedback-analyzed.ts
      application/           # ports/ (FeedbackAnalysisRepository, SentimentAnalyzer, BudgetGuard),
                             # use-cases/ (ProcessAnalysisJob, ReportUnanalyzed)
      adapters/outbound/     # memory repository, NoBudgetGuard, openai/ (adapter, config), fake/ (demo analyzer),
                             # prompts/feedback-analysis-v1.ts
      public/                # FeedbackAnalyzed, UnanalyzedReport
    insights/
      domain/                # scope, complaint, reported-feedback, not-found; b2b-client/ (B2bClient, ClientId,
                             # SecretHash, token errors), time-range/ (TimeRange, zoned clock), paging/ (Cursor,
                             # KeyCursor, PageSize), summary/ (tally)
      application/           # ports/ (B2bClientRepository, SecretHasher, B2bAccessTokens, ReportingQueries, AuditLog),
                             # use-cases/ (IssueB2bToken, ListBranches, ListBrandFeedbacks, GetBranchSummary,
                             # GetHeatmap, ListTopics, RecordB2bAccess), topic-names
      adapters/
        inbound/http/        # token, feedback and summary controllers, audit interceptor, Zod query schemas
        inbound/demo/        # B2B_DEMO_CLIENTS parsing and seeding
        outbound/            # memory client repository and audit log, scrypt hasher, B2B signing key, jose tokens
    catalog/
      domain/                # sector, geo-point, topic-key; brand/, branch/ (QrCode, QrToken), label-set/
      application/           # ports/ (repositories), use-cases/ (ResolveQr, ProvideLabelSet, RevokeQrCode)
      adapters/
        inbound/demo/        # demo catalog definition, generated snapshot, loader
        outbound/            # memory-*.repository.ts
      public/                # QrResolver, BranchDirectory, LabelSetProvider, CatalogSector, isCatalogSector
    gamification/
      domain/                # level-policy, reward-amounts; wallet/ (Wallet, LedgerEntry, ledger-access)
      application/           # ports/ (WalletRepository), use-cases/ (OpenWallet, AwardReward, GetWallet,
                             # LookupReward)
      adapters/
        inbound/http/        # WalletController (GET /v1/me/wallet)
        outbound/            # memory-wallet.repository.ts (wallets + append-only ledger)
      public/                # RewardLookup, WalletReader
scripts/                   # check-mock.ts, generate-demo-catalog.ts
test/
  support/                 # fakes, builders, in-memory harnesses
  unit/                    # shared-kernel/, analysis/, catalog/, feedback/, gamification/, identity/, insights/, platform/, composition/
  contract/                # support/ (generic contracts), analysis/, catalog/, feedback/, gamification/, identity/, insights/
  e2e/                     # the real AppModule over HTTP; global-setup.ts bundles the contract, setup.ts
                           # checks every response against it
```

Target (`docs/07` §3). Each context's folders are created when that context is built, one module at a time:

```
src/
  shared-kernel/           # ports and types
    adapters/              # shared in-memory adapters (plain TypeScript)
  platform/
    http/                  # shared HTTP infrastructure (built in S0-05)
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

## HTTP platform

`src/platform/http/` is the shared, framework-bound part of every inbound HTTP adapter. It imports no context (`platform-imports-no-context`); what it needs from a context it defines as an interface, and the composition root implements it.

| File                   | What it does                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error-codes.ts`       | The one table from error code to HTTP status (and the fixed `title`). A test keeps it equal to the contract's catalog and `ErrorCode` enum. 429 is only for `RATE_LIMITED`                                                                                       |
| `problem-details.ts`   | The `Problem` shape (RFC 9457 plus `code`, `requestId`, `retryAfterSeconds`, `errors`). There is no user-facing message                                                                                                                                          |
| `problem-exception.ts` | What a controller throws to end a request; `ProblemException.from(domainError)` keeps the code, the field of a validation error and `retryAfterSeconds`                                                                                                          |
| `problem.filter.ts`    | Turns every error into `application/problem+json`. Framework errors map by status; anything unexpected is `INTERNAL_ERROR`, logged with the request id and without details                                                                                       |
| `request-id.ts`        | `X-Request-Id`: the caller's if plain, else a new one; echoed in the header and in every Problem                                                                                                                                                                 |
| `bearer-auth.guard.ts` | `mobileBearer`: asks an `Authenticator` (provided by the composition root) who is calling; `@CurrentPrincipal()` hands the caller to the handler                                                                                                                 |
| `configure-http.ts`    | Request id first, then the 8 KB JSON limit, then the filter; `X-Powered-By` disabled. Shared by `main.api.ts` and the e2e tests                                                                                                                                  |
| `parse-body.ts`        | Request format validation with Zod; failures become `VALIDATION_ERROR` with the offending fields. Meaning is checked in the domain, not here                                                                                                                     |
| `raw-body.ts`          | `HTTP_APP_OPTIONS` (no default parser, raw body kept) for every entry point; `rawBodyOf` throws if a parsed body has no raw bytes, so a wiring mistake can never verify proofs against nothing                                                                   |
| `client-auth.guard.ts` | `b2bOAuth`: a `ClientAuthenticator` (from the composition root) turns the bearer token into a client; `@RequireScope` per route (401 / 403); a scope denial is recorded through `ClientAccessRecorder` first; `@CurrentClient()` hands the client to the handler |

Controllers stay thin: parse the body, call one use case, turn an `Err` into a `ProblemException`, and map the result to the contract's JSON.

## Rules and how they are enforced

| Rule                                                                                                                                                | Tool                                                             | Where                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Domain imports only its own domain and the shared kernel (no packages, no Node built-ins)                                                           | dependency-cruiser `domain-is-pure`                              | `.dependency-cruiser.cjs`                       |
| Application imports only its own domain/application, the shared kernel and other contexts' `public/`                                                | dependency-cruiser `application-has-no-infrastructure`           | `.dependency-cruiser.cjs`                       |
| A context reaches another context only through its `public/` folder                                                                                 | dependency-cruiser `only-public-across-contexts`                 | `.dependency-cruiser.cjs`                       |
| The shared kernel imports nothing outside itself                                                                                                    | dependency-cruiser `shared-kernel-is-pure`                       | `.dependency-cruiser.cjs`                       |
| Domain, application and the shared kernel's ports never import `shared-kernel/adapters/`                                                            | dependency-cruiser `core-does-not-use-shared-adapters`           | `.dependency-cruiser.cjs`                       |
| An aggregate's events can be taken only in outbound repository adapters                                                                             | dependency-cruiser `repository-access-only-in-outbound-adapters` | `.dependency-cruiser.cjs`                       |
| Demo data (`adapters/inbound/demo/`) is imported only by the composition root                                                                       | dependency-cruiser `demo-data-only-from-composition`             | `.dependency-cruiser.cjs`                       |
| Demo data is never loaded in production (`DEMO_DATA=true` with `NODE_ENV=production` fails startup)                                                 | `isDemoDataEnabled` + e2e test                                   | `src/composition/demo-data.ts`                  |
| A context's access keys (`*-access.ts`) only in its own domain and outbound adapters                                                                | dependency-cruiser `context-access-only-in-domain-and-outbound`  | `.dependency-cruiser.cjs`                       |
| Event files (`domain/events/`) import only the shared kernel                                                                                        | dependency-cruiser `domain-events-only-shared-kernel`            | `.dependency-cruiser.cjs`                       |
| `platform/` imports no context and no composition                                                                                                   | dependency-cruiser `platform-imports-no-context`                 | `.dependency-cruiser.cjs`                       |
| The error code to HTTP status table equals the contract's error catalog and `ErrorCode` enum                                                        | `error-catalog.spec.ts`                                          | `test/unit/platform/`                           |
| Every e2e response matches `docs/api/openapi.yaml` (shape, status, content type, headers, error code)                                               | ajv + Redocly bundle, checked after each e2e test                | `test/e2e/setup.ts`, `test/support/contract.ts` |
| Error responses leak no internals (T-I7)                                                                                                            | `error-hygiene.e2e-spec.ts`                                      | `test/e2e/`                                     |
| The development verifiers refuse `NODE_ENV=production` (TC-AUTH-09)                                                                                 | e2e start-up test                                                | `test/e2e/auth-token-and-startup.e2e-spec.ts`   |
| Event routes are registered only in `src/composition/event-routes.ts` and frozen before serving                                                     | Start-up check (`EVENT_ROUTES_CHECK`) + code review              | `src/composition/persistence.module.ts`         |
| Adapters log only through the `Logger` port, without personal data                                                                                  | Code review                                                      | `docs/07` §6                                    |
| No circular dependencies                                                                                                                            | dependency-cruiser `no-circular`                                 | `.dependency-cruiser.cjs`                       |
| Complexity ≤ 9, depth 3, params 3, function ≤ 40 lines (not in tests), file ≤ 300 lines, 1 class per file, no `any`, no `!`                         | ESLint + typescript-eslint (type-aware)                          | `eslint.config.mjs`                             |
| `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`                              | TypeScript                                                       | `tsconfig.json`                                 |
| Shared kernel + domain + application line coverage ≥ 80 %                                                                                           | Vitest coverage (v8)                                             | `vitest.config.ts`                              |
| No high or critical dependency vulnerabilities                                                                                                      | `npm audit --audit-level=high`                                   | `.github/workflows/ci.yml`                      |
| The API contract lints without errors or warnings (`recommended` rules; `info-license` and `no-server-example.com` turned off, reasons in the file) | Redocly CLI                                                      | `redocly.yaml`                                  |

NestJS appears only in `adapters/` and `composition/` (ADR-021); dependency-cruiser fails the build otherwise.

## Tests

- Vitest with globals enabled. Four projects in `vitest.config.ts`: `unit`, `contract` and `integration` run `test/<level>/**/*.spec.ts`; `e2e` runs `test/e2e/**/*.e2e-spec.ts`.
- Coverage is measured only on `src/shared-kernel`, `src/*/domain` and `src/*/application`.
- Fakes, not mocks, for ports; `FakeClock` for time; Given / When / Then (`docs/07` §9).
- The e2e tests boot the real `AppModule` with a fake clock and a recording logger (`test/support/start-app.ts`) and talk to it over HTTP with `supertest`. A `globalSetup` bundles `docs/api/openapi.yaml` once with Redocly; a recording middleware checks every response against it and `test/e2e/setup.ts` fails the test that provoked a mismatch.

## NestJS CLI conventions

Generate NestJS files with the CLI, then adjust them to the layout above. Spec files are turned off in `nest-cli.json` because tests live under `test/`.

```sh
npx nest g module catalog composition --flat                     # src/composition/catalog.module.ts, registered in AppModule
npx nest g controller feedback contexts/feedback/adapters/inbound/http --flat  # src/contexts/feedback/adapters/inbound/http/feedback.controller.ts
```

Use cases and ports are plain TypeScript; they are wired into NestJS in `composition/` with factory providers (`docs/07` §2).

## Decisions made during development

| Decision                                                                                                                                              | Reason                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESM project (`"type": "module"`, `module: nodenext`)                                                                                                  | NestJS 12 is ESM-only                                                                                                                                                                      |
| Vitest instead of Jest (`docs/07` v1.1, `docs/04` v1.3)                                                                                               | Native ESM support                                                                                                                                                                         |
| Vitest 5 rather than the 4.1 generated by `nest new`                                                                                                  | npm 10 crashes resolving Vitest 4.1's optional peer dependencies                                                                                                                           |
| ESLint + typescript-eslint rather than the oxlint generated by `nest new`                                                                             | `docs/07` §8; type-aware rules such as `no-floating-promises`                                                                                                                              |
| TypeScript `~6.0`                                                                                                                                     | typescript-eslint 8.71 supports TypeScript < 6.1                                                                                                                                           |
| Node ≥ 22.22.3                                                                                                                                        | Required by `@angular-devkit/schematics`, used by `@nestjs/schematics`                                                                                                                     |
| `postgres:14-alpine`, `redis:7.2-alpine`                                                                                                              | Images already available on the development machine. PostgreSQL 14 reaches end of life in November 2026; upgrading is a one-line change. Redis runs with `noeviction` for BullMQ (ADR-011) |
| dependency-cruiser `shared-kernel-is-pure` (`docs/07` v1.1)                                                                                           | Every domain imports the shared kernel, so its purity protects all of them                                                                                                                 |
| Prism runs from the `stoplight/prism:5.15.10` Docker image, not npm                                                                                   | Prism ≥ 5.15.7 needs Node ≥ 24.14; the image keeps it out of our dependencies and `npm audit`. The image is amd64-only, so it runs under emulation on Apple Silicon                        |
| Prism started with `-m false`                                                                                                                         | Prism 5.15.10 crashes in its default multiprocess mode                                                                                                                                     |
| QR tokens are 16 random bytes (22 base64url characters)                                                                                               | The FR-QR-01 minimum (128 bits); shortest QR content                                                                                                                                       |
| Demo QR codes are a committed snapshot, restored with `Branch.reconstitute`                                                                           | Printed QR codes must stay valid across restarts and the PostgreSQL switch; `Branch.issueQrCode` stays the only way to make a token                                                        |
| `tsx` runs TypeScript scripts (`npm run demo:snapshot`)                                                                                               | Plain Node cannot resolve our `./x.js` imports to `.ts` files                                                                                                                              |
| Composition wires use cases with factory providers and symbol tokens (`src/composition/tokens.ts`)                                                    | No dependence on decorator metadata (`docs/07` §2)                                                                                                                                         |
| S0-06 (Gamification) before S0-05 (Identity)                                                                                                          | Owner decision: every user has a wallet from the moment they exist; the publishers' event contracts are written first                                                                      |
| `fast-check` for TC-GAM-04                                                                                                                            | Generates and shrinks operation sequences; the seed is printed on failure                                                                                                                  |
| Each ledger entry stores `xpTotalAfter` (SDD v1.2)                                                                                                    | A feedback's level-up is derived from a fact that never changes                                                                                                                            |
| A ledger entry's earning date is the feedback's `submittedAt`                                                                                         | Points expiry counts from the customer's visit, and it is identical across retries                                                                                                         |
| Only the named ledger-key constraint maps to `ConcurrencyConflictError`                                                                               | A duplicate reward key is a concurrency symptom; every other unique violation is an infrastructure error                                                                                   |
| Development attestation: a made-up envelope with real P-256 / ES256 proof of possession                                                               | The same cryptographic path as production; both development verifiers refuse `NODE_ENV=production`                                                                                         |
| `jose` for ES256 access tokens; key from `JWT_PRIVATE_KEY` and `JWT_KEY_ID`                                                                           | Only ES256 and our `kid` are accepted; a key is generated outside production and required in production                                                                                    |
| Zod 4 validates request format at the HTTP edge only                                                                                                  | Strict objects mirror `additionalProperties: false`; meaning stays in the domain                                                                                                           |
| Identity's `SessionWalletReader`, answered in the composition root                                                                                    | Identity depends on no other context, so there is no context cycle                                                                                                                         |
| Waiting challenges are capped (10 000)                                                                                                                | The challenge endpoint needs no login; the trade-off is recorded in `docs/08` S0-10                                                                                                        |
| `ajv` and `ajv-formats` as devDependencies; Redocly bundles the contract                                                                              | Real responses are checked against `openapi.yaml` in every e2e test without a YAML parser                                                                                                  |
| Contexts under `src/contexts/`                                                                                                                        | Rules match contexts by path; shared folders (`shared-kernel/`, `platform/`, `composition/`) never need exceptions                                                                         |
| The proof and the fingerprint are taken over the raw body bytes                                                                                       | Re-serialized JSON can differ from what the device signed (spaces, key order)                                                                                                              |
| `Idempotent-Replayed` is always sent (`true` or `false`)                                                                                              | The contract documents it as a boolean header on every 202                                                                                                                                 |
| `qrCodeId` is a plain string in Feedback                                                                                                              | Feedback's domain may not import Catalog's types                                                                                                                                           |
| An unreadable raw text is thrown (`RawTextUnreadableError`), not a domain error                                                                       | An integrity failure with no API code (`docs/07` §6); owner decision A                                                                                                                     |
| The unique pair (user, Idempotency-Key) is an infrastructure error, not a conflict                                                                    | `docs/07` v1.13 maps only two constraints; the replay lookup and the cooldown's version already catch races                                                                                |
| Analysis is asked before the 24-hour close's transaction                                                                                              | No outside call inside a unit of work; a retry reuses the answer                                                                                                                           |
| The prompt lives in `src/contexts/analysis/adapters/outbound/prompts/feedback-analysis-v1.ts`, not `prompts/` (owner decision)                        | It ships with the build, the version is explicit, and no file is loaded at start-up                                                                                                        |
| The OpenAI adapter uses plain `fetch`, no SDK                                                                                                         | No new dependency; the strict JSON schema is a few lines                                                                                                                                   |
| Error statuses other than 408/409/429/5xx throw instead of `unavailable`                                                                              | A wrong key or model must never look like an outage that earns a 24-hour reward                                                                                                            |
| Pre-checks are narrow (owner decision A)                                                                                                              | A spam verdict costs the user the attempt; terse real complaints go to the LLM                                                                                                             |
| `FeedbackAnalyzed` carries no spam reason                                                                                                             | It is kept in Analysis for quality monitoring only (SDD 6.1)                                                                                                                               |
| B2B client secrets are scrypt hashes from `node:crypto` (owner decision)                                                                              | No download; OWASP parameters stored in the hash; constant-time comparison                                                                                                                 |
| Demo B2B clients come from `B2B_DEMO_CLIENTS`, never from git (owner decision)                                                                        | No known secret in the repository; secrets of at least 32 characters; refused in production                                                                                                |
| B2B tokens have their own key and `aud: "b2b"` (owner decision)                                                                                       | Neither guard accepts the other's tokens; the keys rotate independently                                                                                                                    |
| Each context loads its own signing key                                                                                                                | `docs/07` §3 puts crypto in a context's `adapters/outbound/`; `platform/` holds only HTTP                                                                                                  |
| `platform/` is shared technical infrastructure, inbound (`http/`) and outbound (`queue/`); the BullMQ `JobQueue` adapter lives there (owner decision) | The `JobQueue` port belongs to the shared kernel (used by `OutboxRelay`), so its adapter cannot sit in one context's `adapters/outbound/`, and the shared kernel cannot use libraries      |
| Every client has an expiry; a demo client without one expires 90 days after start-up                                                                  | FR-B2B-01 and ADR-013 require an expiry for every client identity                                                                                                                          |
| Business rules of reports stay in the Insights domain (`REPORTABLE_STATUSES`, `tally`)                                                                | `ReportingQueries` only filters by what it is given, so its PostgreSQL version holds no rules (ADR-019 spirit)                                                                             |
| A topic key the current label set no longer has keeps its key as its name                                                                             | A report never loses a topic after a label-set change                                                                                                                                      |
| The audit entry is written before the response; a failed write fails the request                                                                      | No B2B data leaves unaudited (FR-B2B-09, T-R2); the token endpoint hands out no data and is not audited                                                                                    |
| The contract checker closes an `allOf` with `unevaluatedProperties: false`                                                                            | Closing each branch would reject what another branch adds                                                                                                                                  |

## Known gaps

- Vitest's default transformer may not emit decorator metadata. A NestJS provider that relies on class-based injection inside a Vitest test may need `unplugin-swc`. Factory providers avoid this.
- An access token is trusted until it expires (at most 15 minutes); a key revoked meanwhile is refused at the next session.
- The attestation is a development stand-in. The real Apple and Google verifiers come later, so the application cannot start in production yet.
- The challenge store is in memory and single-process; per-IP rate limiting is S0-10.
- The in-memory unit of work runs one request at a time, so TC-QR-01 never produces a real conflict in memory; the conflict path is tested with a scripted repository, and the real race against PostgreSQL in S0-11.
- Nothing runs `ProcessAnalysisJob` or `FinalizeUnanalyzedFeedback` yet: the outbox relay, the queue, the worker and the 24-hour sweeper are S0-10 (the sweeper is wired in its own module, because it needs Feedback and Analysis together).
- The platform proof is a development stand-in, like the attestation.
- The customer demo must run with `LLM_DRIVER=openai`; the stand-in is for development only (SDD 11.1 shows real spam and prompt-injection labelling).
- Anthropic adapter (Should, ADR-018) not built; cut line, `docs/08` §4.
- No budget guard and no cost in money yet (`NoBudgetGuard`, SDD 11.1); token counts are stored, and `cost_micro_usd` must be added before S0-13 (NFR-COST-01).
- The OpenAI request sets no `max_completion_tokens` and no temperature yet; both are set once S0-13 has chosen the model.
- SDD 8.1 still names `prompts/feedback-analysis/v1` as the prompt location (next docs pass).
- A B2B date range has no maximum length (owner decision for the demo); whether to cap it, e.g. at 366 days, is a question for the customer (SRS §11.3).
- B2B reports read the in-memory store until S0-11; summaries and the heatmap are counted in memory over the period's feedback.
