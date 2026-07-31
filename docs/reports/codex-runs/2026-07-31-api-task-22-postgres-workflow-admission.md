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
- `POSTGRES_INTEGRATION_HOST=/tmp/mediaforge-task04-postgres-socket POSTGRES_INTEGRATION_PORT=55432 POSTGRES_INTEGRATION_DATABASE=mediaforge_task04 pnpm test:focused -- packages/persistence/src/postgres-workflow-repository.integration.test.ts` — passed (6 tests) against live PostgreSQL.

## Commit Hash

Pending this report-only verification commit.

## Unresolved Risks

The integration test remains environment-gated by design. Existing filesystem CLI commands have not been cut over.
