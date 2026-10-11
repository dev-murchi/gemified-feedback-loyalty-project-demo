# CLAUDE.md – Project handoff for Claude Code

Summary of the planning conversation (9–11 Oct 2026), kept up to date during development (last update 12 Oct 2026). The `docs/` folder is the source of truth; this file tells you what matters, what was decided, and how to work with the owner. Docs are in Turkish; code, identifiers and commits are in English.

## 1. Project in one paragraph

Backend for a **gamified, AI-assisted feedback and loyalty engine** for physical retail brands (fuel stations, coffee chains). A customer scans a branch QR code in the existing Flutter app, writes a comment, an LLM classifies it (sentiment, topic, spam), valid comments earn XP/points, and brands read masked, aggregated feedback through a B2B API. Original customer text: `docs/00-musteri-proje-metni.md`. Murat Çay is a freelance backend engineer; a demo was promised to the customer "in a few days" (demo date still not fixed).

## 2. How to work with the owner (important)

These rules were set after real friction in the planning chat. Follow them.

- **Two hats:** act as a senior software engineer teammate *and* as the real project owner/customer when a product question comes up. Say which hat you are wearing.
- **One decision at a time.** Do not batch several decisions into one message.
- **Do not change docs or files without explicit approval.** Propose, then wait.
- **Do not decide for the user and never close an SDLC phase unless asked.** (Earlier the design phase was closed prematurely: "kapat demedim" = "I didn't say close it".)
- **Short messages.** State uncertainty honestly; never overstate what was verified (e.g. counts, test results).
- **Git:** never commit, push, tag or `git restore` on your own. Give the commands; Murat runs them. Conventional Commits, trunk-based.
- Murat wants to **learn** the architecture (he hasn't coded for a while): explain *why* briefly when introducing a pattern.
- Avoid "amateur" shortcuts he rejected before: IP-only rate limits, shared device secrets, SQL holding business rules, design depth beyond the demo goal.
- **One module at a time.** Never build several modules together; finish one, show it, get the go-ahead. Large backlog items (size L, or M with many parts) are planned as committable slices.
- **Before writing code:** propose a Conventional Commits message for anything pending, then ask "shall I start?" and wait. An approved plan or decision is not a go-ahead.
- **Commit messages never contain a `Co-Authored-By:` (or any attribution) line.**
- **Ask before downloads or launching apps** (`npm install`, `docker pull`, opening Docker Desktop, …); never reopen an app Murat closed.
- **Reviews:** Murat reviews each step and often sends review findings (HIGH/MEDIUM/LOW); fix them before the commit. Show real `npm run verify` output under Node 22, never a summary of a run that did not happen.

## 3. Where we are in the SDLC

| Phase | State |
| --- | --- |
| Requirements | Closed – SRS v1.5 (customer validation pending at demo) |
| Design | Closed 10 Oct 2026; SDD v1.1 aligned on 11 Oct; v1.2 on 12 Oct (`xp_total_after`, S0-06) |
| **Development** | **Sprint 0 restarted from scratch on 11 Oct 2026. S0-01 done 11 Oct 2026 (CI green, reviewed). S0-02 done 11 Oct 2026 (CI green, reviewed; contract 0.2.1-demo). S0-03 done 11 Oct 2026 (CI green, reviewed; review fixes: `takeEvents` key, `InMemoryTable` copies). S0-04 done 11 Oct 2026 (CI green, reviewed; review fixes: conflicts thrown and rolled back, `docs/07` v1.6). S0-06 in progress, before S0-05 (owner decision: every user has a wallet from the moment they exist): slice 1 (wallet domain, publishers' event contracts) implemented and reviewed 12 Oct 2026; slice 2 (persistence) and slice 3 (use cases, event routes, wiring) open.** |

A first Sprint 0 attempt existed; its code and the git history were removed on purpose on 11 Oct 2026. Do not recreate it.

## 4. Documents (read before coding)

| File | Use it for |
| --- | --- |
| `docs/01-gereksinim-dokumani-SRS.md` (v1.5) | Requirements IDs (FR-*, NFR-*, US-*), open questions (§9), customer validation list (§11.3), change requests CR-001..006 |
| `docs/02-yazilim-tasarim-dokumani-SDD.md` (v1.2) | Architecture, ADR-001..021, ERD (§6.1), aggregates/transactions (§6.2), DB guarantees G-1..G-4 (§6.3), reward rules (§6.4), security (§7), AI design (§8), demo scope (§11.1) |
| `docs/03-tehdit-modeli.md` | STRIDE threats and mitigations |
| `docs/04-test-stratejisi.md` (v1.3) | Test levels, critical scenarios, demo test subset (§8) |
| `docs/06-alan-modeli.md` (v1.0) | **DDD model:** bounded contexts, context map, ubiquitous language (TR↔EN), aggregates, invariants, events, ports, use cases, transaction boundaries |
| `docs/07-muhendislik-standartlari.md` (v1.8) | **Coding rules:** layers, folder layout, DDD rules, use-case pattern, error handling, quality gates, ESLint + dependency-cruiser config, tests, DoD |
| `docs/08-sprint-0-backlog.md` | **Work order:** S0-01..S0-15 with done criteria and cut line |
| `docs/api/openapi.yaml` (0.2.1-demo) | API contract: 12 endpoints, RFC 9457 errors, 17 error codes. Code must match it exactly |

`docs/05-musteri-ozeti.md` (customer summary) does not exist yet; it is S0-15.

## 5. Architecture decisions (summary)

- **Stack:** Node.js 22 + TypeScript (strict), NestJS **only in adapters and composition root**, PostgreSQL by default (customer DB standard unknown, SRS S-20), Redis, BullMQ behind a `JobQueue` port (`QUEUE_DRIVER`), Vitest, Testcontainers. ESM project; ESLint + typescript-eslint (not oxlint); Vitest 5; TypeScript ~6.0; Node ≥ 22.22.3. Implementation details in `ARCHITECTURE.md`.
- **Style:** modular monolith; Clean Architecture / ports and adapters; DDD. Domain + application are framework-free (ADR-021). **Database is connected last**: in-memory adapters first, same contract tests later run against PostgreSQL (ADR-017). ORM choice is deferred to S0-11 and recorded as an ADR.
- **Bounded contexts (6):** Identity, Catalog, Feedback, Analysis, Gamification, Insights (B2B) + minimal `shared-kernel`. Cross-context access only through each context's `public/` folder.
- **Communication:** synchronous domain events inside one unit of work; the **transactional outbox is the only async boundary** (`FeedbackSubmitted` → analysis queue) (ADR-020). Events: `UserRegistered`, `FeedbackSubmitted`, `FeedbackAnalyzed`, `FeedbackValidated`. Event types live with their publisher in `<context>/public/` (consumers import them, never copy them). Routes are registered only in `src/composition/event-routes.ts` with keys typed from the event types; the router is frozen after registration. An event without a route fails the unit of work.
- **Transactions (deliberate multi-aggregate exceptions):** Register = User + Wallet; Submit = Feedback + RawText + RewardCooldown + outbox; Analysis result = FeedbackAnalysis + Feedback + RewardCooldown + Wallet. LLM call happens *before* the transaction.
- **Concurrency:** business rules live in aggregates, not SQL; optimistic locking with a `version` column (0 = never stored; saving it is an insert; `markSaved` after a save) (ADR-019). A conflict is **thrown** (`ConcurrencyConflictError`, never in a `Result`) and rolls back the whole unit of work; use cases wrap the complete `uow.run` in `retryOnConflict` (one rerun; a second conflict becomes `500 INTERNAL_ERROR`). All decisions come before the first save (a returned `Err` does not roll back). Only the ledger idempotency-key constraint, matched by name, is mapped to a conflict; other unique violations are infrastructure errors.
- **Identity (Lazy Auth / shadow wallet):** no signup. Device key attested by the platform (iOS App Attest; Android Key Attestation + Play Integrity), challenge–response, ES256 JWT ≤ 15 min, low-trust mode for unattested devices (no rewards), per-request `X-Platform-Proof` bound to SHA-256 of the body. Demo uses `DevAttestationVerifier` (must refuse to start in production).
- **Reward rules (`RewardCooldown` aggregate, per user + branch):** one pending feedback at a time; 24 h since the *submission time* of the last rewarded feedback; ≤ 3 attempts in any 24 h (sliding log, not fixed window). Methods: `reserve(feedbackId, now)`, `complete(feedbackId, outcome, submittedAt)`. Spam does not refund the attempt.
- **Rate limiting:** GCRA in Redis keyed on verified identity; pre-auth endpoints use broad IP limits only (CGNAT).
- **Idempotency:** `Idempotency-Key` + request fingerprint; same key with a different body is rejected.
- **LLM (Analysis = anti-corruption layer):** `SentimentAnalyzer` port; OpenAI adapter is Must, Anthropic is Should (`LLM_DRIVER`); model chosen by measurement on an eval set (~50 per sector for demo) (ADR-018, open). Output JSON `{sentiment, topicKey, isValid, spamReason}`; sentiment is a fixed 5-value enum; versioned prompt `prompts/feedback-analysis/v1`. PII masking before sending: phone, email, plate, TCKN (with checksum), IBAN, card (Luhn). Retries with backoff for 24 h, status stays `analyzing`; after 24 h → `unanalyzed` and treated as valid only if pre-checks passed, normal trust and budget guard not active. No user-visible `failed` status. Profanity in a real complaint is **not** spam.
- **Gamification:** append-only ledger (`idempotency_key` unique: `reward:{id}`, `clawback:{id}`), wallet = sum of ledger. Total XP to reach level L = 100 × L × (L − 1) / 2; the level is derived from XP, not stored in the domain. Each entry stores `xpTotalAfter` (SDD v1.2) for level-up; its earning date is the feedback's `submittedAt` (FR-GAM-08). The wallet is loaded together with the ledger key in question (`findWithLedgerKey`); "already awarded" is `ok` and saves nothing. Rewards 10 XP / 5 points, configurable.
- **B2B:** OAuth2 client credentials, scopes `b2b.feedback.read` / `b2b.summary.read`, cross-tenant access returns 404, only masked text, Europe/Istanbul for date ranges, cursor pagination.
- **API errors:** RFC 9457 Problem Details with `code`; `REWARD_COOLDOWN` / `ATTEMPTS_EXHAUSTED` → **422** with `retryAfterSeconds` in body; **429 only for `RATE_LIMITED`**; no user-facing `message` field (app localizes by code). Comment text 20–1000 code points after NFC.
- **KVKK:** raw text stored encrypted (envelope encryption, KMS in prod / local key in demo), deleted after 2 years.

## 6. Code quality gates (enforced in CI, see `docs/07` §7–8)

- ESLint: `complexity` max **9** (Murat's requirement: < 10), `max-depth` 3, `max-params` 3 (use cases take one `deps` object), `max-lines-per-function` 40 (not in tests), `max-lines` 300, `max-classes-per-file` 1, no `any`, no non-null assertion. TS strict flags. Prettier.
- dependency-cruiser: no cycles; domain imports only its own domain + shared-kernel; application has no infrastructure; contexts only reach each other via `public/`; the shared kernel is pure and its ports never import `shared-kernel/adapters/`; repository capability keys (`repository-access.ts`, context `*-access.ts`) only in outbound adapters / own domain; demo data only from `composition/`.
- High cohesion: one use case per class; value objects with `Result` for validation; `create` vs `reconstitute` factories; business outcomes as `Result`, not exceptions; one code→HTTP mapping table tested against the error catalog.
- Tests: fakes, not mocks, for ports; shared contract test suites run against in-memory and PostgreSQL adapters; `FakeClock`; coverage ≥ 80 % for shared kernel + domain + application. Redocly lint and Prism mock for the contract.

Use-case shape:

```ts
export class SubmitFeedback {
  constructor(private readonly deps: SubmitFeedbackDeps) {}
  async execute(cmd: SubmitFeedbackCommand): Promise<Result<SubmitFeedbackResult, SubmitFeedbackError>> { /* ... */ }
}
```

## 7. Sprint 0 order (from `docs/08`)

S0-01 skeleton + quality gates (prove a complexity-10 function and a forbidden import fail, then delete them) → S0-02 contract validation with Redocly/Prism → S0-03 shared kernel (Result, Clock, DomainEvent, UnitOfWork with sync events + outbox) → S0-04 Catalog → S0-06 Gamification (first: wallet core, the publishers' event contracts `identity/public/user-registered.ts` and `feedback/public/feedback-validated.ts`, and the event routes) → S0-05 Identity (incl. `/v1/me/wallet` and the user + wallet transaction test) → S0-07 Feedback → S0-08 Analysis → S0-09 Insights → S0-10 outbox relay, BullMQ, Redis → S0-11 PostgreSQL adapters + ORM ADR + migrations → S0-12 e2e/contract tests → S0-13 AI eval + model decision → S0-14 demo data + script → S0-15 customer summary.

Demo excludes: AWS/Terraform, real App Attest/Play Integrity, KMS, budget guard, retention jobs, full OAuth2 management (SDD §11.1).

## 8. Open items

- Code runs locally on Murat's Mac (Node 22 through nvm, Docker Desktop).
- Owner inputs still needed: demo date; OpenAI (and Anthropic) API keys + budget; a second person to label the eval set.
- Customer decisions pending: SRS §9.3 open questions (KVKK roles, retention, LLM budget, points policy, Apple/Google setup, DB standard S-20, QR domain), SRS §11.3 (14 proposals to validate), CR-001 (QR sharing risk), SDD K-9 (post-MVP maintenance owner).

## 9. Lessons from the first attempt (avoid repeating)

- Reward window bugs (a single window allowed two rewards; fixed window allowed 6 attempts at the boundary) → rules are now a tested aggregate with a sliding log.
- Dual writes inside the worker; ledger unique on `feedback_id` (blocked clawbacks) → one transaction + typed idempotency keys.
- Business rejections returned 429 (clients auto-retry) → 422.
- Business rules were written in SQL (`INSERT … ON CONFLICT … WHERE`) → moved into aggregates (ADR-019).
- Module names differed from the domain model → use `identity, catalog, feedback, analysis, gamification, insights, shared-kernel`.
