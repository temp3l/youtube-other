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
