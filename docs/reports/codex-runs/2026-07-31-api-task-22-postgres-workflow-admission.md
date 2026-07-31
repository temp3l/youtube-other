# Codex Run: API Task 22 — PostgreSQL Workflow Admission Composition

## Summary

Added one transactional PostgreSQL workflow-admission port and connected it to the API startup path and an additive CLI `workflow admit` command. Both use the same application handler; startup is fail-closed without `MEDIAFORGE_WORKFLOW_DATABASE_URL`.

## Changed Paths

- `packages/persistence/src/postgres-workflow-repository.ts`
- `packages/persistence/src/postgres-workflow-admission.unit.test.ts`
- `packages/config/src/index.{ts,unit.test.ts}`
- `apps/api/{package.json,src/index.ts}`
- `apps/cli/{package.json,src/index.ts,src/workflow-admission-*}`
- `docs/cli.md`, `pnpm-lock.yaml`

## Tests

- `pnpm test:focused -- packages/persistence/src/postgres-workflow-admission.unit.test.ts` — passed (2 tests).
- Filtered persistence/config/API/CLI typecheck — passed after refreshing workspace links and declarations.

## Commit Hash

Base: `666a973`; changes remain uncommitted.

## Unresolved Risks

Live PostgreSQL migration/admission remains environment-gated. Existing filesystem CLI commands have not been cut over.
