# Legacy retirement implementation report

Source plan: `docs/plans/legacy-retirement/README.md`

Date: 2026-08-01

Commits: Task 01 `0aceb6c`; Task 02 `be4577e`

## Summary and files

Task 01 is complete. Task 02 is partial: speech/CLI rollout telemetry records
staged, blocked, monolithic, dry-run, and actual rollback selections. The
migration register, ten-target production matrix, architecture, plan, tests,
and reports were updated.

## Task status and deviations

- Completed: Task 01 and Task 02 local observability.
- Partial: Task 02 production rollout.
- Not completed: default promotion and Tasks 03–08.
- Deviation: `legacy` remains default because paid matrix evidence, owner, and
  release window are absent.

## Checks and results

Passed focused telemetry (7), pipeline (2), and CLI (10) tests. The final
telemetry run used a temporary alias for cross-worktree Vite resolution.
Workflow-engine declaration build and speech typecheck passed. No paid provider
ran.

## Risks and next steps

Authorize and cap the five-language full/Short matrix, record its reviewer and
release window, then promote the default only if every quality gate is accepted.
