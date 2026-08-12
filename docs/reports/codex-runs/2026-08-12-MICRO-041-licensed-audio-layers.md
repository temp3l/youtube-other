# MICRO-041 licensed audio layers and rights evidence

Date: 2026-08-12
Task: MICRO-041
Status: DONE

## Summary

Added licensed/imported ambience, SFX and music timeline tracks with immutable provenance, territory/term rights evidence, production readiness gates, SQLite persistence, and render mix manifests. Generated music providers remain explicitly unsupported.

## Changed paths

- `packages/domain/src/microdrama-licensed-audio-contracts.ts`
- `packages/domain/src/microdrama-licensed-audio-lifecycle.ts`
- `packages/domain/src/episode-timeline.ts`
- `packages/persistence/src/microdrama-licensed-audio-*.ts`
- `packages/rendering/src/microdrama-licensed-audio-mix.ts`
- `packages/rendering/src/microdrama-render-manifest.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/domain/src/microdrama-licensed-audio-lifecycle.unit.test.ts` — 3 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/persistence/src/microdrama-licensed-audio-domain.unit.test.ts` — 2 passed
- `pnpm exec vitest run -c vitest.integration.config.ts packages/persistence/src/microdrama-licensed-audio-repository.integration.test.ts` — 2 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/rendering/src/microdrama-licensed-audio-mix.unit.test.ts` — 2 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/rendering/src/microdrama-render-manifest.unit.test.ts` — 2 passed

## Risks

- Locale composition does not yet auto-attach licensed audio tracks; callers must supply `tracks.licensedAudio` explicitly.

## Backlog

- MICRO-041 → DONE
