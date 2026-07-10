# Task 09: Render Validation And Repair Flows

## Objective

Make rendering consume validated inputs only, support `--only-ready`, and expose targeted repair flows instead of implicit regeneration.

## Existing Functionality To Reuse

- `packages/rendering/src/index.ts`
- `packages/image-generation/src/video-image-spec.ts`
- `packages/speech/src/audio-validation.ts`
- `apps/cli/src/index.ts`

## Scope

- `stories render`
- `stories render validate`
- `stories production repair`
- final media validation and skipped-target reporting

## Files Likely To Inspect

`packages/rendering/src/index.ts`, `packages/image-generation/src/video-image-spec.ts`, `packages/speech/src/audio-validation.ts`, `apps/cli/src/index.ts`

## Files Likely To Edit

Render wrappers, readiness guards, final validation reports, repair-command assembly.

## Implementation Steps

1. Add a multi-target render wrapper with `--only-ready`.
2. Reject missing images, invalid image dimensions, missing audio, incomplete clip folders, and manifest mismatches before render start.
3. Add final media validation for resolution, audio track, duration range, and clip continuity.
4. Add `stories production repair` for explicit upstream regeneration choices.

## Tests To Add/Update

- render skip of blocked outputs
- missing audio rejection
- invalid image rejection
- final media validation coverage
- repair command target filtering

## Verification Commands

`pnpm test:focused -- packages/image-generation/src/video-image-spec.unit.test.ts`
`pnpm test:focused -- packages/speech/src/narration-pipeline.unit.test.ts`

## Risks

The repo currently exposes low-level render entry points. The wrapper must not hide failure causes or silently start regenerating missing assets.

## Rollback Notes

Keep the current top-level `render <episode-id>` command intact until wrapper validation is trusted.

## Acceptance Criteria

Rendering skips blocked outputs when requested, continues ready outputs, and validates final media rather than assuming success from file existence alone.

## Parallelization Notes

Must follow tasks 07 and 08.
