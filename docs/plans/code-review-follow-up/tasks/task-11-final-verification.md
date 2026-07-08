# Task 11: Final Verification

## Objective

Verify the refactor follow-up work with focused commands and document remaining risks.

## Findings Addressed

CR-021, CR-022, CR-024, plus verification closure for all prior tasks.

## Files Likely To Inspect

`package.json`, `scripts/test-focused.sh`, `scripts/codex-command-guard.sh`, affected package `package.json` files, changed source/tests/docs.

## Files Likely To Edit

Verification report and small command documentation only, unless failures reveal task-owned defects.

## Implementation Steps

Run focused tests for each touched package. Run at most one affected-package typecheck after focused tests pass. Check docs diffs. Classify any stale `dist` issue before building.

## Tests To Add/Update

No new tests by default; add only if verification reveals an untested regression.

## Verification Commands

`pnpm test:focused -- <changed-test-file>`
`pnpm --filter @mediaforge/<package> typecheck`
`git diff --check -- <changed-paths>`

## Risks

Broad verification can be costly and expose unrelated failures. Do not run broad commands without explicit approval.

## Rollback Notes

Rollback failed task commits individually; keep characterization tests unless intentionally retired.

## Acceptance Criteria

All focused tests for touched areas pass or remaining failures are classified with exact command, test name, owning module, and smallest follow-up.

## Parallelization Notes

Runs last. Do not parallelize with implementation tasks.
