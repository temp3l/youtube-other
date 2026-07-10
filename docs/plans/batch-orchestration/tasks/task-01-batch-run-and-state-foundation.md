# Task 01: Batch Run And State Foundation

## Objective

Define the shared run/state contracts that allow text batches, image batches, audio, and render gates to report through one consistent orchestration surface.

## Existing Functionality To Reuse

- `packages/story-localization/src/story-workflow.types.ts`
- `packages/story-localization/src/story-workflow-store.ts`
- `packages/story-localization/src/story-workflow-status.ts`
- `packages/shared/src/episode-filesystem.ts`

## Scope

- add a run-level schema and storage contract
- define production-state summary shape per episode
- map existing workflow and batch statuses into the new orchestration statuses
- define `custom_id` parsing and mapping rules

## Files Likely To Inspect

`packages/story-localization/src/story-workflow.types.ts`, `packages/story-localization/src/story-workflow-store.ts`, `packages/story-localization/src/story-workflow-batch.ts`, `packages/story-localization/src/story-localization.schemas.ts`, `packages/image-generation/src/image-batch.types.ts`, `packages/shared/src/episode-filesystem.ts`

## Files Likely To Edit

Shared workflow schemas, shared batch/run helpers, and CLI-facing status adapters.

## Implementation Steps

1. Introduce a run-level schema for `batches/<run-id>/batch-plan.json`.
2. Add a compact per-episode production state summary.
3. Define conversion helpers from existing batch/workflow statuses to orchestration statuses.
4. Add readable `custom_id` parsing/validation helpers while preserving compatibility with existing deterministic IDs.

## Tests To Add/Update

- run-state schema validation
- `custom_id` parsing
- duplicate `custom_id` rejection
- status mapping coverage

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-workflow-batch.unit.test.ts`

## Risks

Status duplication can drift if both workflow and orchestration state are writable without a single owner.

## Rollback Notes

Keep run-state helpers additive and do not replace existing workflow manifests in this task.

## Acceptance Criteria

The repo has one documented and test-covered run/state contract that later tasks can consume without inventing incompatible status shapes.

## Parallelization Notes

Do not parallelize this task with any importer or CLI behavior change.
