# Task 02: Text Batch Plan, Submit, And Download

## Objective

Wrap the existing text batch service so operators can plan, submit, inspect, and download English rewrite, quality, localization, and short runs through a consistent CLI.

## Existing Functionality To Reuse

- `apps/cli/src/story-localization-commands.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
- `packages/story-localization/src/story-localization-openai-batch.ts`

## Scope

- `stories batch plan`
- `stories batch submit`
- `stories batch status`
- `stories batch download`
- run-level audit folder creation

## Files Likely To Inspect

`apps/cli/src/story-localization-commands.ts`, `packages/story-localization/src/story-localization-batch-service.ts`, `packages/story-localization/src/story-localization-batch-index.ts`, `packages/story-localization/src/story-localization.types.ts`

## Files Likely To Edit

CLI command registration, text batch service wrappers, batch run storage helpers.

## Implementation Steps

1. Add a plan-only wrapper that writes `batch-plan.json` and `input.jsonl`.
2. Reuse existing submit logic and store provider metadata in `provider-batch.json`.
3. Reuse existing refresh/status logic for run-level summaries.
4. Download provider output/error files into the run folder without importing them yet.

## Tests To Add/Update

- plan file generation
- run ID creation
- CLI option validation
- download path persistence

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts`

## Risks

The CLI wrapper must not diverge from the existing batch service semantics or silently bypass current retry/index logic.

## Rollback Notes

Keep the new commands as wrappers over the current service so rollback only removes the wrapper surface.

## Acceptance Criteria

Operators can create a text batch plan, submit it later, inspect status, and download provider artifacts without importing raw results into downstream stages.

## Parallelization Notes

May follow task 01 only; do not overlap with task 03 importer work.
