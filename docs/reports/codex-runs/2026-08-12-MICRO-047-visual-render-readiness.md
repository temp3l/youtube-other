# MICRO-047 visual and render readiness

Date: 2026-08-12
Task: MICRO-047
Status: DONE

## Goal

Evaluate shared visuals, localized composition, rights, safe-zone and render evidence independently from publication via `VISUAL_RENDER_READY`.

## Files changed

- `packages/microdrama/src/visual-render-readiness.ts`
- `packages/microdrama/src/visual-render-readiness.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/microdrama/src/visual-render-readiness.unit.test.ts` — 6 passed

## External calls

None.

## Backlog

- MICRO-047 → DONE

## Risks

- Safe-zone readiness defaults to the passing `base-9x16` fixture; TikTok-target layouts require explicit passing layout evidence.
