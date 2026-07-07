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
