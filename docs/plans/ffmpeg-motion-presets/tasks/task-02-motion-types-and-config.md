# Task 02 - Motion Types and Config

## Goal

Add strict TypeScript domain types and central config for render motion with no runtime behavior change.

## Context

Motion should be render-owned initially. Existing visual-retention uses `VisualMotionPreset = "subtle" | "balanced" | "strong"`, so new render motion types must avoid naming conflicts.

## Files to Inspect

- `packages/rendering/src/index.ts`
- `packages/config/src/index.ts`
- `packages/config/src/index.unit.test.ts`
- `packages/domain/src/index.ts`
- `apps/cli/src/episode-commands.ts`

## Implementation Steps

1. Create `packages/rendering/src/motion/types.ts`.
2. Define `MotionPresetFamily`, `MotionIntensity`, `MotionVideoKind`, `MotionStoryBeat`, `MotionImageKind`, `MotionPresetId`, `MotionPreset`, `ShotMotionContext`, `SelectedMotionPreset`, and `MotionRenderConfig`.
3. Create `packages/rendering/src/motion/config.ts` with disabled defaults.
4. Export motion types from `packages/rendering/src/index.ts` or a rendering barrel.
5. Optionally add config schema fields in `packages/config/src/index.ts`, defaulting disabled.

## Tests to Add/Update

- `packages/config/src/index.unit.test.ts`
- New `packages/rendering/src/motion/config.unit.test.ts` if local tests are preferred.

## Acceptance Criteria

- Strict types compile.
- Motion defaults to disabled.
- No FFmpeg arguments, render fingerprints, manifests, or CLI behavior change.

## Rollback Notes

Remove new motion type/config files and exports. No generated assets should be affected.

## Explicit Constraints

- Do not add presets yet.
- Do not integrate with renderer yet.
- Do not rename existing `VisualMotionPreset`.

## No Unrelated Changes

Do not change visual-retention planner behavior or existing command flags.
