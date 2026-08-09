# VRI-02 episode lifecycle

- Date: 2026-08-09
- Changed files: `packages/persistence/src/relational-workflow-state.ts`, `packages/persistence/src/postgres-workflow-repository.ts`, `packages/persistence/src/postgres-episode-approval-persistence.unit.test.ts`, `apps/api/src/contract.ts`, `apps/api/src/contract.unit.test.ts`, `apps/api/src/postgres-api-use-cases.ts`, `apps/api/src/postgres-api-use-cases.unit.test.ts`.
- Implemented: additive archive/clone lifecycle state and lineage; append-only clone revision evidence; historical-revision cloning; CAS archive; idempotent mutation admission; API lifecycle contracts, authorization, and redacted errors.
- Checks: `git diff --check` passed. `pnpm test:focused -- packages/persistence/src/postgres-episode-approval-persistence.unit.test.ts` passed (9 tests), including idempotent replay of the originally admitted clone identity.
- Risks/follow-up: API-focused tests and API typecheck could not resolve unbuilt workspace packages (`@mediaforge/application`, `@mediaforge/dynamic-genre`, and related dependencies). The failure predates this lifecycle code and should be retried after the workspace dependency artifacts are built. HTTP routes/OpenAPI parity intentionally remain for VRI-19.
