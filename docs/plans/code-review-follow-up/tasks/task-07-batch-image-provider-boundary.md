# Task 07: Batch Image Provider Boundary

## Objective

Separate OpenAI batch mechanics from image orchestration and normalize provider verification.

## Findings Addressed

CR-008, CR-009, CR-018.

## Files Likely To Inspect

`packages/image-generation/src/image-batch-service.ts`, `packages/image-generation/src/image-batch-planner.ts`, `packages/image-generation/src/openai-image.ts`, `packages/story-localization/src/story-localization-openai-batch.ts`, `packages/testing/src/openai-endpoint-guard.unit.test.ts`.

## Files Likely To Edit

New provider adapter types plus image batch service call sites.

## Implementation Steps

Introduce an `ImageBatchProvider` interface for upload/create/retrieve/download. Keep OpenAI JSONL and status normalization in the adapter. Share image decode/MIME/dimension validation between direct and batch generation.

## Tests To Add/Update

Fake provider tests for submit, refresh, download/import, malformed provider lines, and direct image validation.

## Verification Commands

`pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts`
`pnpm test:focused -- packages/image-generation/src/openai-image.unit.test.ts`

## Risks

Provider behavior is externally unstable. Do not enable edit batches until real-provider verification is approved.

## Rollback Notes

Keep adapter introduction behind existing public functions so rollback restores old service internals.

## Acceptance Criteria

OpenAI-specific batch lifecycle code is isolated from orchestration, and tests use a fake provider.

## Parallelization Notes

Coordinate with task 06 and task 03 when changing manifest/provider shapes.

