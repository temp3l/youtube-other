# Codex Run: Tenant Reconciliation Scheduler PostgreSQL Integration

## Summary

Added an environment-gated PostgreSQL integration suite for the tenant YouTube reconciliation scheduler. It verifies reconciliation-topic filtering, RLS tenant isolation, provider-outage retention of uncertain publications, and rollback/reschedule behavior when reconciliation persistence fails. YouTube stays fully mocked.

## Changed Paths

- `apps/api/src/tenant-reconciliation-scheduler.integration.test.ts`
- `docs/reports/codex-runs/2026-07-31-tenant-reconciliation-scheduler-postgres-integration.md`

## Tests

- `pnpm test:focused -- apps/api/src/tenant-reconciliation-scheduler.integration.test.ts` — collected successfully; 3 tests skipped because `POSTGRES_INTEGRATION_HOST` is unset.
- `pnpm --filter @mediaforge/api typecheck` — passed.
- Prettier applied to the changed paths; `git diff --check` passed.

## Commit Hash

`HEAD` (the commit created for this completed run).

## Unresolved Risks

The live PostgreSQL path is intentionally skipped without the explicit integration environment. Provider failure is a durable operator-visible reconciliation outcome, so it preserves the uncertain publication rather than retrying the read-only lookup automatically.
