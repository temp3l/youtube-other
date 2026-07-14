# Batch 6 CLI Skeleton

Commit: `2197009156ed909d8a4e61757ef7554bcab49770` (changes uncommitted).

## Summary

Implemented the additive workflow operator and CLI: registry-derived help,
list/explain, plan/graph/status/next, one-task `run-next`, explicit continuation,
run, resume, retry, invalidate, reconcile, validate-state, override, stable JSON,
actionable errors, and exit codes. A packaged no-provider fixture exercises the
complete operator loop. Batch 7 is unblocked; production callers remain on
their compatibility commands.

## Changed paths

- `packages/workflow-engine/src/{workflow-errors,workflow-operator,workflow-store,index}*`
- `apps/cli/src/{workflow-commands,index,index-setup,packaged-cli}*`
- `apps/cli/package.json`, `pnpm-lock.yaml`
- Batch status, audit status, AI context, and this report

## Tests/checks

- Workflow-operator Vitest: 4 passed.
- Workflow CLI Vitest: 3 passed.
- Packaged e2e: 3 passed; post-failure workflow loop passed manually after the
  global/local dry-run precedence fix.
- Workflow-engine/CLI builds and CLI typecheck passed.

## Risks and follow-up

The packaged e2e file was not rerun after its final repair due to the two-rerun
budget. Real profile task implementations remain deliberately unbound until
their caller-family migration batches.
