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

Optional combined batch — Tasks 01–05 sequentially before renderer integration.

## Recommended Model

GPT-5.5 High / Thinking only

## Batch-Specific Constraints

- This is efficient but less reviewable than the split batches.
- Run Tasks 01, 02, 03, 04, and 05 sequentially.
- Stop after Task 05.
- Do not start Task 06.
- After each task, run only focused tests for that task.
- At the end, summarize changed files, tests run, and remaining risks before any renderer integration work.

## Included Tasks

# Task 01 - Characterization Tests

## Goal

Add focused tests that pin current rendering behavior before motion preset implementation.

## Context

The renderer already supports scene clips, shot clips, `zoompan` from `RenderShot.motion`, derived-shot caching, final concat, and narration audio alignment. These tests must pass before any production motion code is added.

## Files to Inspect

- `packages/rendering/src/index.ts`
- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/filter-builders.unit.test.ts`
- `packages/rendering/src/derived-shot-cache.unit.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`

## Implementation Steps

1. Add or extend tests proving `buildSceneClipFilterGraph()` current output for 16:9 and 9:16.
2. Add or extend tests proving motion-disabled future config, if introduced in this task, preserves the current filter string.
3. Add a render fixture test for full scene rendering with local generated image and synthetic audio only.
4. Add a render fixture test for short/vertical rendering with local generated image and synthetic audio only.
5. Add assertions that current shot-plan `RenderShot.motion` generates `zoompan` and affects render-operation fingerprint.

## Tests to Add/Update

- `packages/rendering/src/index.unit.test.ts`
- `packages/rendering/src/filter-builders.unit.test.ts`

## Acceptance Criteria

- Tests pass before production motion implementation.
- No renderer behavior changes.
- Fixture output is under temp directories only.
- No external APIs or generated production assets are touched.

## Rollback Notes

Revert only the tests from this task. No production code should depend on them yet.

## Explicit Constraints

- Do not implement the motion preset system.
- Do not weaken existing assertions.
- Do not update snapshots broadly.
- Do not run repository-wide tests.

## No Unrelated Changes

Make no unrelated refactors, formatting churn, CLI changes, or documentation edits.


---

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


---

# Task 04 - Seeded Selection

## Goal

Implement deterministic weighted motion preset selection.

## Context

The existing shot planner uses `hashText`-based deterministic helpers in `packages/visual-planning/src/shot-planner.ts`. Reuse the same pattern, but keep render motion selection in `packages/rendering/src/motion`.

## Files to Inspect

- `packages/rendering/src/motion/types.ts`
- `packages/rendering/src/motion/presets.ts`
- `packages/visual-planning/src/shot-planner.ts`
- `packages/shared/src/index.ts`

## Implementation Steps

1. Create `packages/rendering/src/motion/seeded.ts` with stable unit and weighted choice helpers.
2. Create `packages/rendering/src/motion/selection.ts`.
3. Implement weighted family distributions for full and short.
4. Map existing visual phases to motion story beats where available.
5. Implement repeat prevention:
   - no same preset back-to-back when configured;
   - no same family longer than configured run length;
   - no consecutive high-intensity presets;
   - no shorts preset for full unless explicit override.
6. Implement safe fallback behavior.
7. Implement explicit preset override validation.

## Tests to Add/Update

- New `packages/rendering/src/motion/selection.unit.test.ts`

## Acceptance Criteria

- Same seed and context returns same selection.
- Different seed can vary.
- Full videos do not select shorts presets by default.
- Missing metadata falls back safely.
- Approximate family distribution is within documented tolerance over many shots.

## Rollback Notes

Remove selection modules and tests. Registry remains independent.

## Explicit Constraints

- Do not use `Math.random()` in production selection.
- Do not integrate into renderer yet.
- Do not mutate manifests.

## No Unrelated Changes

Do not alter visual-retention shot planner selection in this task.


---

# Task 05 - FFmpeg Filter Builder

## Goal

Implement pure FFmpeg filter generation for the 15 presets without integrating it into production rendering.

## Context

`packages/rendering/src/filter-builders` already supports `scale`, `crop`, `zoompan`, `eq`, `fade`, `noise`, `vignette`, `overlay`, and `format`. Prefer these existing primitives.

## Files to Inspect

- `packages/rendering/src/filter-builders/types.ts`
- `packages/rendering/src/filter-builders/zoompan.ts`
- `packages/rendering/src/filter-builders/effects.ts`
- `packages/rendering/src/filter-builders/index.ts`
- `packages/rendering/src/filter-builders.unit.test.ts`
- `packages/rendering/src/motion/presets.ts`

## Implementation Steps

1. Create `packages/rendering/src/motion/filter-builder.ts`.
2. Define a pure API that accepts preset, duration, FPS, output resolution, video kind, and seed.
3. Generate conservative operation lists for every preset.
4. Respect 16:9 and 9:16 output profiles.
5. Use `zoompan` frame count rules matching current renderer behavior.
6. Add only missing filter-builder primitives if absolutely required and well-tested.
7. Provide a concise filter summary helper for reports.

## Tests to Add/Update

- New `packages/rendering/src/motion/filter-builder.unit.test.ts`
- Extend `packages/rendering/src/filter-builders.unit.test.ts` only if primitives are added.

## Acceptance Criteria

- Every preset generates a non-empty operation list or valid static hold operation list.
- Filters use supported primitives only.
- Output resolution is respected.
- Frame count and duration math are deterministic.
- No production render path changes.

## Rollback Notes

Remove motion filter builder and tests. Revert any new filter primitive only if unused elsewhere.

## Explicit Constraints

- Do not integrate with `FFmpegVideoRenderer` yet.
- Do not add non-FFmpeg dependencies.
- Do not add overlay asset requirements.

## No Unrelated Changes

Do not change existing static scene filter behavior in this task.
