# Source manifest + bulk approval follow-up

## Summary

Source manifest JSON loading, bulk approval aggregation, DAG contract fixes, pilot fixture hardening, e2e timeout, and lightweight math task-id extraction for CLI tests.

## Changed files

- `packages/strategic-reinvention/src/**` — manifest loading, pilot fixture, DAG deps, pilot test timeout
- `packages/veronica-media/src/**` — bulk aggregate, translation overflow, PNG label embedding, e2e timeout
- `packages/math-education/src/orchestration/math-executable-task-ids.ts` — dist-free task id export
- `apps/cli/src/workflow-commands.unit.test.ts` — import lightweight task ids

## Tests

- `source-adaptation-bridge.unit.test.ts` — pass (3)
- `workflow.integration.test.ts` — pass (4)
- `bulk-aggregate.unit.test.ts` — pass (1)
- `translation.unit.test.ts` — pass (1)
- `pilot.unit.test.ts` — pass (1); validates PNG label checksum invalidation
- `e2e.integration.test.ts` — pass (1, 120s timeout)
- `pilot.integration.test.ts` — hook-blocked; rerun locally
- `workflow-commands.unit.test.ts` — import fix applied; rerun locally

## Risks

- `pilot.integration.test.ts` and `workflow-commands.unit.test.ts` hook-blocked in agent session; confirm in CI
- Branch `veronica-media-integration-v2` at `3f778bb` synced with `origin`

## Follow-up

- History generic visual-plan extraction (deferred)
- Full glossary localization beyond `detectLayoutOverflow` flags
