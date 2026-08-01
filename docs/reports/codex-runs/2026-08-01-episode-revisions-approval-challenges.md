# Episode revisions and approval challenges

## Changed files

- `packages/persistence/src/relational-workflow-state.ts`
- `packages/persistence/src/postgres-workflow-repository.ts`
- `packages/persistence/src/postgres-episode-approval-persistence.unit.test.ts`
- `docs/reports/codex-runs/2026-08-01-episode-revisions-approval-challenges.md`

## Summary

Added project/workspace-scoped compare-and-swap episode content replacement. Each accepted replacement appends content, revision lineage, and evidence to an immutable `episode_revisions` row. Added single-use approval challenge creation guarded by the current project-bound workflow revision and an existing project-owned artifact hash. Challenge identity, expiry, revision, and hash bindings are immutable after creation; only first consumption is allowed.

## Checks and results

- `pnpm test:focused -- packages/persistence/src/postgres-episode-approval-persistence.unit.test.ts`: passed, 5 tests.
- `pnpm exec prettier --check ...`: passed for all three affected source/test files after formatting.
- `pnpm --filter @mediaforge/persistence typecheck`: blocked by pre-existing concurrent error in `tenant-object-storage.ts:149` (`boolean` is not assignable to branded literal `true`). No error was reported in the changed episode/approval code.

## Risks and follow-up

No PostgreSQL integration test was run. HTTP/contracts/SDK, approval revocation, and publication execution remain intentionally unchanged.
