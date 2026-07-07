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

Tasks 04–05 — deterministic selection and pure FFmpeg filter builder.

## Recommended Model

GPT-5.5 High / Thinking

## Batch-Specific Constraints

- Run Task 04 first, then Task 05.
- Keep both modules pure.
- Do not integrate with `FFmpegVideoRenderer`.
- Do not start Task 06.
- Do not use `Math.random()` in production code.

## Included Tasks

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
