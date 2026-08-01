# Legacy retirement Task 02 rollout evidence

## Summary

Started Task 02 without prematurely promoting narration. Added structured
rollout-selection telemetry and counters, instrumented staged and monolithic
routes, and defined the full/Short matrix for six languages. Legacy dry-runs do
not count as rollback executions.

## Changed paths

- `packages/speech/src/narration-{telemetry,pipeline}*`
- `apps/cli/src/index.ts`
- Narration architecture, migration evidence/register, plan status, and reports

## Tests

Initial focused runs passed: telemetry 7, pipeline 2, CLI 10. Final telemetry
reruns were blocked before collection by missing built
`@mediaforge/observability`; CLI typecheck exposed the same widespread fresh-
worktree declaration problem. No paid providers ran.

## Commit

`be4577e` (`feat(speech): record narration rollout selections`).

## Risks

Default remains `legacy`. Final code needs a clean telemetry rerun. Production
matrix evidence, named owner/window, Italian adapter decision, and unwrapped CLI
usage remain blockers.
