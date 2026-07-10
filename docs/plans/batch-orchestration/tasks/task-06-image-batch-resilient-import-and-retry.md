# Task 06: Image Batch Resilient Import And Retry

## Objective

Ensure image batches continue through mixed success/failure outcomes, accept valid sibling images, and generate precise retry plans for failed or validation-failed assets.

## Existing Functionality To Reuse

- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/image-generation/src/image-batch-identity.ts`
- `packages/image-generation/src/openai-image-batch-provider.ts`
- `packages/image-generation/src/video-image-spec.ts`
- `packages/image-generation/src/image-generation-config.ts`

## Scope

- `stories images batch submit`
- `stories images batch status`
- `stories images batch sync`
- `stories images batch retry-plan`
- per-asset failure and validation recording

## Files Likely To Inspect

`packages/image-generation/src/image-batch-service.ts`, `packages/image-generation/src/image-batch-storage.ts`, `packages/image-generation/src/image-batch-identity.ts`, `packages/image-generation/src/openai-image-batch-provider.ts`, `packages/image-generation/src/video-image-spec.ts`

## Files Likely To Edit

Image batch importer, retry-plan builder, CLI wrapper output, failure record schemas.

## Implementation Steps

1. Preserve out-of-order `custom_id` reconciliation.
2. Import successful results even when siblings fail.
3. Validate actual image dimensions per profile generation size.
4. Mark failed assets retryable without failing the full run.
5. Write `import-report.json`, `validation-report.json`, and `retry-plan.json`.

## Tests To Add/Update

- partial image import with one failed item
- dimension mismatch as validation failure
- successful siblings remain accepted
- failed-only retry plans
- validation-failed-only retry plans

## Verification Commands

`pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts`
`pnpm test:focused -- packages/image-generation/src/video-image-spec.unit.test.ts`

## Risks

The importer already handles several of these semantics. The main risk is regressing existing retry and reconciliation behavior while adding run-level reports.

## Rollback Notes

Keep retry planning additive around the existing image batch service.

## Acceptance Criteria

One failed image no longer stops the whole image batch, valid sibling images remain usable, and the CLI emits an exact retry command.

## Parallelization Notes

Do not parallelize with task 05 or task 07.
