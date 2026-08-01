# Legacy retirement Task 02 rollout evidence

## Summary

Started Task 02 without prematurely promoting narration. Added structured
rollout-selection telemetry and counters, instrumented staged and monolithic
routes, and defined the full/Short matrix for five Dark Truth languages. Legacy
dry-runs do not count as rollback executions.

## Changed paths

- `packages/speech/src/narration-{telemetry,pipeline}*`
- `apps/cli/src/index.ts`
- Narration architecture, migration evidence/register, plan status, and reports

## Tests

Passed focused telemetry (7), pipeline (2), and CLI (10) tests. Built only
workflow-engine declarations to unblock and pass speech typecheck. No paid
providers ran.

## Commit

`be4577e` (`feat(speech): record narration rollout selections`).

## Risks

Default remains `legacy`. Production matrix evidence and a named owner/release
window remain blockers.
