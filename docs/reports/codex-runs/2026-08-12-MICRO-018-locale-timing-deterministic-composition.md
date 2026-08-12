# MICRO-018 locale timing and deterministic composition

Date: 2026-08-12
Task: MICRO-018
Status: DONE

## Goal

Compose shared visual semantics with locale audio, timing, subtitles and UI via EpisodeTimeline revisions, per-locale shot timing, and deterministic FFmpeg manifests with render cache identity.

## Files changed

- `packages/domain/src/episode-timeline.ts`
- `packages/domain/src/index.ts`
- `packages/alignment/src/locale-shot-timing-projection.ts`
- `packages/alignment/src/index.ts`
- `packages/visual-planning/src/locale-shot-timing.ts`
- `packages/visual-planning/src/index.ts`
- `packages/microdrama/src/locale-composition.ts`
- `packages/microdrama/src/scene-shot-plan-fixture.ts`
- `packages/microdrama/src/locale-composition.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `packages/rendering/src/microdrama-render-manifest.ts`
- `packages/rendering/src/microdrama-render-manifest.unit.test.ts`
- `packages/rendering/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/microdrama/src/locale-composition.unit.test.ts` — 2 passed
- `pnpm test:focused -- packages/rendering/src/microdrama-render-manifest.unit.test.ts` — 2 passed

## External calls

None.

## Backlog

- MICRO-018 → DONE

## Risks

- FFmpeg manifest compiler emits per-clip intermediates; production orchestration must materialize concat lists before execution.
- Scene-shot plan fixture used when V5 episode markdown is unavailable in CI worktrees.
