# VRI-14 render derivatives and previews

## Changed files

- `packages/veronica-media/src/rendering/render-derivative.ts`
- `packages/veronica-media/src/rendering/render-derivative.unit.test.ts`
- `packages/veronica-media/src/index.ts`

## Summary

Added the canonical `veronicabenini` render-derivative adapter. It accepts only approved composition and locale-edition manifests plus independently approved supplied-human voice evidence, validates locale/revision, aspect ratio, composition and narration-audio lineage, and records deterministic FFmpeg command and preview evidence. The result is immutable, revision-bound, cache-reusable, redacts failure evidence, and is always `planned` with external dispatch disabled.

## Checks run

- `pnpm test:focused -- packages/veronica-media/src/rendering/render-derivative.unit.test.ts` — 2 passed after using the rendering contract's source subpath.
- `pnpm --filter @mediaforge/rendering build` — blocked because `@mediaforge/process-runner` is unbuilt.
- `pnpm --filter @mediaforge/process-runner build` — blocked because `@mediaforge/observability/telemetry.js` is unbuilt.
- `git diff --check` — passed.

## Risks and follow-up

The isolated rendering package build remains blocked by its unbuilt process-runner/observability dependency chain. No FFmpeg, provider, source, or publication action was enabled.
