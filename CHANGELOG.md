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

### Changed

- `docs/07` v1.1 and `docs/04` v1.3: Vitest replaces Jest; `docs/07` adds the `shared-kernel-is-pure` dependency rule.

### Removed

- The code of the first Sprint 0 attempt; development restarted from scratch on 11 October 2026.
