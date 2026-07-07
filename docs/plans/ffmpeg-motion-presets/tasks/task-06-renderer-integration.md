# Task 06 - Renderer Integration

## Goal

Integrate motion rendering into the existing FFmpeg renderer safely.

## Context

The renderer is segment-first. Scene clips are audio-backed, shot clips are silent derived clips cached by fingerprint, and final concat/audio composition should remain unchanged.

## Files to Inspect

- `packages/rendering/src/index.ts`
- `packages/rendering/src/motion/*`
- `packages/shared/src/episode-filesystem.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`

## Implementation Steps

1. Extend `VideoRenderRequest` with optional `motion?: MotionRenderConfig`.
2. Keep disabled path byte-for-byte or assertion-equivalent to current behavior.
3. Thread motion config into scene clip request building.
4. Add motion selection/filter operations only when enabled.
5. Include motion config, selected preset, seed, and operation summary in render fingerprints.
6. Add additive motion fields to scene and shot clip manifests if needed.
7. Preserve derived-shot cache lookup and invalidation semantics.
8. Preserve final concat, narration audio mapping, caption burn-in, and validation.

## Tests to Add/Update

- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`
- `packages/rendering/src/motion/filter-builder.unit.test.ts`

## Acceptance Criteria

- Existing rendering tests still pass.
- Motion disabled render remains unchanged.
- Motion enabled fixture render succeeds.
- Segment duration matches narration/shot duration within existing tolerance.
- Full and short profiles validate expected resolution.

## Rollback Notes

Revert renderer integration while leaving pure motion modules if desired.

## Explicit Constraints

- Do not run in parallel with Task 07 or Task 08.
- Do not alter generated episode assets.
- Do not change final audio composition behavior.

## No Unrelated Changes

Do not refactor remote rendering, concat, or caption burn-in beyond what motion requires.
