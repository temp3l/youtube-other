# Task 03: Text Batch Import, Normalize, And Validate

## Objective

Import batch text results safely into episode folders, normalize them, validate them, and record item-level failures without trusting provider output order.

## Existing Functionality To Reuse

- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/localized-content-text.ts`
- `packages/story-localization/src/story-localization.service.ts`

## Scope

- `stories batch import`
- `stories batch validate`
- `stories batch sync`
- failure recording and retry-plan inputs for text stages

## Files Likely To Inspect

`packages/story-localization/src/story-localization-batch-service.ts`, `packages/story-localization/src/generated-story-validator.ts`, `packages/story-localization/src/localized-content-text.ts`, `packages/story-localization/src/story-workflow-store.ts`

## Files Likely To Edit

Text batch importer, validation adapters, workflow persistence, CLI sync/reporting output.

## Implementation Steps

1. Keep `custom_id` as the only import key.
2. Reuse current import logic and extend it to write run-level import and validation reports.
3. Normalize imported localized content before validation.
4. Prevent overwrite of approved artifacts without `--force`.
5. Persist failure records and retry candidates per item.

## Tests To Add/Update

- output order independence
- partial import with mixed success/failure
- idempotent re-import
- approved artifact overwrite protection
- validation-failed item recording

## Verification Commands

`pnpm test:focused -- packages/story-localization/src/story-localization.batch.integration.test.ts`
`pnpm test:focused -- packages/story-localization/src/generated-story-validator.unit.test.ts`

## Risks

Import and validation responsibilities are currently mixed in the batch service. The task must separate reports without creating a second import path.

## Rollback Notes

Retain the old import entry point until the new sync wrapper is stable.

## Acceptance Criteria

Text batch results are downloaded, imported, normalized, validated, and recorded in episode state before any downstream stage consumes them.

## Parallelization Notes

Do not parallelize with task 02 or task 04.
