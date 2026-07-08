# Task 01: Characterization Tests

## Objective

Lock current behavior before path, manifest, render, provider, remote, and legacy changes.

## Findings Addressed

CR-001 through CR-024, with priority on CR-001 through CR-004, CR-011, CR-012, and CR-013.

## Files Likely To Inspect

`packages/shared/src/episode-filesystem.unit.test.ts`, `apps/cli/src/story-full-rewrite-command.unit.test.ts`, `packages/story-localization/src/story-localization.unit.test.ts`, `packages/image-generation/src/image-batch-service.unit.test.ts`, `packages/image-generation/src/image-batch-planner.unit.test.ts`, `packages/rendering/src/index.unit.test.ts`, `packages/youtube-upload/src/index.unit.test.ts`, `apps/cli/src/render-remote-shell.unit.test.ts`.

## Files Likely To Edit

Focused test files only.

## Implementation Steps

Add tests for authored/generated script ownership, generated image containment, legacy fallback labeling, missing scene audio behavior, subtitle path escaping, absolute shot source rejection, malformed provider output, short alias identity collisions, upload manifest-first selection, and remote invalid result handling.

## Tests To Add/Update

Use temporary workspaces and fake OpenAI/FFmpeg/remote/YouTube clients. Avoid real provider calls and fixture regeneration.

## Verification Commands

`pnpm test:focused -- <changed-test-file>`

## Risks

Some tests may expose current defects. Classify failures before changing production code.

## Rollback Notes

Revert only the added characterization tests if scope changes.

## Acceptance Criteria

Each critical/high finding has at least one focused characterization test or an explicit documented reason why it cannot be tested locally.

## Parallelization Notes

Run first. Do not parallelize with behavior changes.

