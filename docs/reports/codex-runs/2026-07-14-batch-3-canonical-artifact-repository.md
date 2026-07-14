# Batch 3 Canonical Artifact Repository

Commit: `2197009156ed909d8a4e61757ef7554bcab49770` (changes uncommitted).

## Changed paths

- `packages/domain/src/workflow-contracts*`
- `packages/shared/{package.json,src/artifact-path-resolver*,src/episode-filesystem.ts,src/index.ts}`
- `packages/workflow-engine/`, `pnpm-lock.yaml`
- Batch status, AI context, and this report

## Tests/checks and results

- Focused domain contracts: 9 passed.
- Focused shared resolver: 4 passed.
- Focused artifact repository: 5 passed.
- Domain/shared/workflow-engine build or typecheck: passed.
- Targeted ESLint and formatting: passed.
- Final targeted diff check: passed.

## Risks remaining

- Historical unmanifested artifacts remain discoverable only after explicit
  manifest/import work; they are intentionally never treated as valid outputs.
- Existing production callers are unchanged and migrate in later batches.

## Follow-up

- Batch 4 task registry and profile DAG implementation is unblocked.
