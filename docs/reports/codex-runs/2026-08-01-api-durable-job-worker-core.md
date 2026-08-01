# Codex Run: API Durable Job Worker Core

## Summary

Completed the generic durable job path: cooperative cancellation/deadlines, tenant-scoped PostgreSQL `SKIP LOCKED` claims, renewable lease fences, retry/dead-letter persistence, stale-writer rejection, and an API process that migrates, drains work, stops on signals, and closes its pool. The process accepts an injected canonical handler instead of embedding media dispatch policy.

## Changed Paths

- `packages/application/src/durable-job-worker.ts`
- `packages/application/src/durable-job-worker.unit.test.ts`
- `packages/application/src/index.ts`
- `packages/persistence/src/relational-workflow-state.ts`
- `packages/persistence/src/postgres-workflow-repository.ts`
- `packages/persistence/src/postgres-workflow-repository.integration.test.ts`
- `apps/api/src/job-process.ts`
- `apps/api/src/job-process.unit.test.ts`
- `apps/api/src/index.ts`
- this report and the Task 10 implementation report

## Tests

- Focused worker and job-process suites — passed (10 tests: 6 + 4).
- Application typecheck — passed.
- Targeted Prettier check — passed after mechanical formatting.
- PostgreSQL retry/reclaim and stale-fence integration coverage is present but was not rerun for this documentation cleanup.

## Commit Hash

Uncommitted shared worktree.

## Unresolved Risks

Canonical task mapping remains intentionally injected. Each handler must propagate abort signals through renderer/provider adapters; partial outputs need quarantine, and irreversible or uncertain effects require reconciliation evidence before retry.
