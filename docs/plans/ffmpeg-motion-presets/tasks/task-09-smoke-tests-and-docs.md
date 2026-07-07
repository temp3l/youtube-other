# Task 09 - Smoke Tests and Docs

## Goal

Add final smoke verification and operator documentation for FFmpeg motion presets.

## Context

Smoke tests must use local fixture images/audio only and must not modify production episode assets. Documentation should focus on enabling, disabling, seeding, debugging, and safe defaults.

## Files to Inspect

- `packages/rendering/src/index.unit.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`
- `docs/cli-video.md`
- `docs/story-to-video.md`
- `docs/cli-steps.md`

## Implementation Steps

1. Add a smoke render using 3-5 temp fixture images and synthetic audio.
2. Validate output duration and resolution with existing `validateRenderedVideo()` or direct `ffprobe`.
3. Cover full and/or short based on test cost.
4. Document motion modes, preset families, preset IDs, seed reproducibility, debug report path, and troubleshooting.
5. Document that motion is FFmpeg-only and no external APIs are called.
6. Include examples for full videos and shorts.

## Tests to Add/Update

- Focused rendering smoke test file or existing `packages/rendering/src/index.unit.test.ts`.
- CLI help tests if flags were added.

## Acceptance Criteria

- Smoke test passes locally/CI if appropriate.
- Docs explain how to enable/disable motion.
- Docs explain safe defaults and seeds.
- Docs explain how to reproduce a render.

## Rollback Notes

Remove smoke tests and docs. Production code should remain unaffected.

## Explicit Constraints

- Do not regenerate production fixtures.
- Do not call external APIs.
- Do not run broad build/test commands without authorization.

## No Unrelated Changes

Do not update unrelated docs or diagrams.
