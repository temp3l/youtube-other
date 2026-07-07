# Task 03 - Preset Registry

## Goal

Add the initial 15-preset registry and validation helpers without changing rendering behavior.

## Context

The registry is data used by later selection and FFmpeg filter building. It must contain exactly the requested preset IDs and reject invalid entries in tests.

## Files to Inspect

- `packages/rendering/src/motion/types.ts`
- `packages/rendering/src/filter-builders/types.ts`
- `packages/domain/src/visual-retention/treatment-catalog.ts`

## Implementation Steps

1. Create `packages/rendering/src/motion/presets.ts`.
2. Add entries for all 15 presets:
   - `doc_slow_push_in`
   - `doc_slow_pull_back`
   - `doc_left_drift`
   - `tension_creep_zoom`
   - `tension_breathing_frame`
   - `tension_shadow_push`
   - `reveal_pan_to_subject`
   - `reveal_zoom_to_detail`
   - `reveal_from_darkness`
   - `short_fast_push`
   - `short_snap_zoom`
   - `short_impact_shake`
   - `ambient_fog_drift`
   - `ambient_light_flicker`
   - `ambient_static_hold`
3. Add `getMotionPreset()`, `isMotionPresetId()`, and registry validation.
4. Freeze exported data to avoid runtime mutation.

## Tests to Add/Update

- New `packages/rendering/src/motion/presets.unit.test.ts`

## Acceptance Criteria

- Registry contains exactly 15 presets.
- IDs are unique.
- Durations and intensities validate.
- Shorts family is allowed only for short by default.
- No FFmpeg rendering behavior changes.

## Rollback Notes

Remove registry and its tests.

## Explicit Constraints

- Do not implement selection.
- Do not implement filter generation.
- Do not touch CLI.

## No Unrelated Changes

Do not modify treatment catalog or visual-retention presets.
