# Task 08: Rendering Hardening

## Objective

Make local rendering consume validated inputs and reject unsafe paths.

## Findings Addressed

CR-002, CR-012, CR-013, CR-016.

## Files Likely To Inspect

`packages/rendering/src/index.ts`, `packages/rendering/src/filter-builders/escape.ts`, `packages/shared/src/episode-filesystem.ts`, `packages/rendering/src/index.unit.test.ts`.

## Files Likely To Edit

Rendering input validation, subtitle filter construction, shot source path resolution.

## Implementation Steps

Require scene audio or a validated audio/timeline manifest before render. Escape subtitle paths for FFmpeg filters. Reject absolute source image paths outside the episode workspace. Prefer manifest inputs over directory scans.

## Tests To Add/Update

Tests for missing scene audio failure, escaped subtitle paths, absolute path rejection, and manifest-first image selection.

## Verification Commands

`pnpm test:focused -- packages/rendering/src/index.unit.test.ts`

## Risks

Existing episodes may rely on render-time audio slicing. Provide a clear migration error.

## Rollback Notes

Revert render validation changes and tests together.

## Acceptance Criteria

Render no longer creates missing scene audio and cannot consume external shot images by default.

## Parallelization Notes

Must finish before task 09. Do not parallelize with remote renderer changes.

