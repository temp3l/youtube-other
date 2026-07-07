# Codex Implementation Prompt — FFmpeg Motion Presets

You are working in an existing TypeScript monorepo for a YouTube/video generation pipeline. Implement the tasks exactly as requested, with production-grade TypeScript, focused tests, and no unrelated changes.

## Global Rules

- Work sequentially in the order listed in this file.
- Do not skip acceptance criteria.
- Do not introduce external API calls.
- Do not regenerate or mutate production episode assets.
- Do not perform broad formatting churn, unrelated refactors, or snapshot updates.
- Prefer small, reviewable commits/diffs.
- Run only focused tests relevant to the current task unless the task explicitly asks for broader verification.
- Stop before starting any task that is explicitly excluded from this batch.
- At the end, report:
  - changed files;
  - tests/commands run;
  - behavior intentionally unchanged;
  - risks or follow-up items.

## Batch

Tasks 02–03 — motion types/config plus preset registry.

## Recommended Model

GPT-5.5 Medium or High. Use High if the repository has recent unrelated changes.

## Batch-Specific Constraints

- Run Task 02 first, then Task 03.
- Keep motion disabled by default.
- Do not integrate with renderer or CLI.
- Do not rename or alter existing visual-retention `VisualMotionPreset`.

## Included Tasks

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


---

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
