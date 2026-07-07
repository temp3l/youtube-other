# Task 07 - CLI and Manifest Integration

## Goal

Expose render motion options through CLI and additive manifest/report fields.

## Context

`episode-commands.ts` already uses `--motion-preset <subtle|balanced|strong>` for visual-retention planning. New render preset flags should avoid that name unless intentionally migrated.

## Files to Inspect

- `apps/cli/src/index.ts`
- `apps/cli/src/episode-commands.ts`
- `apps/cli/src/index.unit.test.ts`
- `apps/cli/src/episode-commands.unit.test.ts`
- `packages/rendering/src/index.ts`
- `packages/config/src/index.ts`

## Implementation Steps

1. Add top-level render flags:
   - `--motion`
   - `--no-motion`
   - `--motion-mode <off|safe|cinematic|shorts>`
   - `--motion-seed <seed>`
   - `--motion-debug`
   - `--motion-render-preset <presetId>`
2. Add equivalent episode production flags only if renderer integration is stable.
3. Validate invalid modes and preset IDs clearly.
4. Build `MotionRenderConfig` from CLI and runtime defaults.
5. Add optional motion metadata to render-owned manifests only.
6. Keep old manifests readable.

## Tests to Add/Update

- `apps/cli/src/index.unit.test.ts`
- `apps/cli/src/episode-commands.unit.test.ts`
- `packages/config/src/index.unit.test.ts`

## Acceptance Criteria

- Current CLI behavior remains compatible.
- Invalid flags fail clearly.
- Existing `--motion-preset <subtle|balanced|strong>` remains visual-retention-specific.
- Old manifests still render.
- Optional motion metadata is additive.

## Rollback Notes

Remove CLI flags and config wiring. Renderer motion can remain callable programmatically if already merged.

## Explicit Constraints

- Do not run in parallel with Task 06.
- Do not enable motion by default.
- Do not rename existing flags without a migration plan.

## No Unrelated Changes

Do not change episode source resolution, image generation, narration, or upload commands.
