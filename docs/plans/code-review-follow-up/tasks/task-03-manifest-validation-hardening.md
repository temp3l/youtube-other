# Task 03: Manifest Validation Hardening

## Objective

Move file/provider/remote JSON boundaries from casts to owner-owned schemas.

## Findings Addressed

CR-009, CR-011, CR-016, CR-017, CR-019.

## Files Likely To Inspect

`packages/image-generation/src/image-batch-service.ts`, `packages/image-generation/src/image-batch.schemas.ts`, `packages/rendering/src/index.ts`, `scripts/remote-render-worker.mjs`, `packages/youtube-upload/src/index.ts`, `packages/shared/src/episode-filesystem.ts`.

## Files Likely To Edit

Schema files plus boundary readers in image generation, rendering, remote worker, and upload.

## Implementation Steps

Add schemas for scene generation manifests, short scene manifests, OpenAI batch output bodies, remote job manifests, ready markers, remote results, and upload selection inputs. Replace direct casts at those boundaries.

## Tests To Add/Update

Malformed JSON and schema-drift tests for image batch import, remote worker/client results, and upload selection.

## Verification Commands

`pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts`
`pnpm test:focused -- packages/rendering/src/index.unit.test.ts`
`pnpm test:focused -- packages/youtube-upload/src/index.unit.test.ts`

## Risks

Schemas can reject existing stale artifacts. Classify stale fixtures before editing them.

## Rollback Notes

Revert schema introduction and parser call-site changes together.

## Acceptance Criteria

No provider, remote, or upload manifest boundary accepts parsed JSON without schema validation.

## Parallelization Notes

Can run after task 01. Coordinate with task 07 if touching image batch schemas.

