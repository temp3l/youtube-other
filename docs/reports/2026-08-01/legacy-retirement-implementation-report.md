# Legacy retirement implementation report

Source plan: `docs/plans/legacy-retirement/README.md`

Date: 2026-08-01

Commits: Task 01 `0aceb6c`; Task 02 `be4577e`

## Summary and files

Task 01 is complete. Task 02 is partial: added rollout/rollback selection
telemetry, counters/tests, a 12-target production matrix, and updated plan,
register, architecture, and reports. Runtime files changed in `packages/speech`
and `apps/cli`.

## Task status and deviations

- Completed: Task 01.
- Partial: Task 02 evidence/observability.
- Not completed: default promotion and Tasks 03–08.
- Deviation: `legacy` remains default because paid matrix evidence, owner, and
  release window are absent.

## Checks and results

Initially passed telemetry (7), pipeline (2), and CLI (10) focused tests. After
the final non-dry-run refinement, telemetry reruns failed before collection:
unbuilt `@mediaforge/observability` resolution survived two environment fixes.
CLI typecheck likewise failed on widespread missing workspace declarations.

## Risks and next steps

Final code is not fully reverified. Resolve isolated-worktree package outputs,
rerun the telemetry file, reconcile Italian adapter support, authorize/cap the
matrix, then consider changing the default.
