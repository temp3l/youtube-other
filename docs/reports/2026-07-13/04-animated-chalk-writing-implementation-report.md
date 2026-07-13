# Animated chalk writing implementation report

- Source plan: `docs/plans/linux-math-renderer/04-animated-chalk-writing.md`
- Date: 2026-07-13

## Summary of implemented changes

Added an opt-in `animation: { mode: "chalk-write" }` path for `equation` and `equation-transformation`
scenes. Animated scenes now render deterministic partial chalk-writing segments with uneven timing, brief
pauses, layered chalk texture, slight wobble, and a moving chalk tip indicator, then compose those segments
into one scene MP4. Static scenes remain unchanged.

## Files changed

- `packages/educational-renderer/src/contracts.ts`
- `packages/educational-renderer/src/renderers/formula-svg.ts`
- `packages/educational-renderer/src/renderers/chalk-animation.ts`
- `packages/educational-renderer/src/domain/cache-key.ts`
- `packages/educational-renderer/src/domain/cache.ts`
- `packages/educational-renderer/src/application/renderer.ts`
- `packages/educational-renderer/tests/unit/chalk-animation.test.ts`
- `packages/educational-renderer/tests/unit/contracts.test.ts`
- `packages/educational-renderer/tests/integration/render.integration.test.ts`
- `packages/educational-renderer/fixtures/chalk-writing/visual-plan.json`
- `packages/educational-renderer/fixtures/chalk-writing/README.md`
- `packages/educational-renderer/README.md`

## Tasks completed

- Added opt-in animation contract for equation scenes only.
- Implemented deterministic chalk-writing frame generation and segment composition.
- Separated static and animated cache identities and cache manifest representations.
- Added focused unit and integration coverage.
- Added a dedicated animated fixture for manual verification.

## Tasks partially completed

- The moving indicator is a chalk tip/hand proxy, not a fully articulated hand.

## Tasks not completed

- No animation support was added for non-equation scene families.

## Deviations from the original plan

- Implemented animation as concatenated deterministic partial segments instead of a new per-frame rendering
  runtime. This kept the feature bounded inside the existing package architecture.

## Tests/checks run

- `pnpm exec vitest run -c packages/educational-renderer/vitest.config.ts --bail=1 packages/educational-renderer/tests/unit/chalk-animation.test.ts` -> exit 0.
- `pnpm exec vitest run -c packages/educational-renderer/vitest.config.ts --bail=1 packages/educational-renderer/tests/unit/contracts.test.ts packages/educational-renderer/tests/integration/render.integration.test.ts` -> first exit 1 (`OUTPUT_VALIDATION_FAILED` for animated duration drift), second exit 0 after frame-quantized timing fix.
- `pnpm --filter @mediaforge/educational-renderer typecheck` -> exit 0.
- `pnpm --filter @mediaforge/educational-renderer build` plus three sample renders and FFprobe under `/tmp/educational-renderer-chalk-samples-OpQ1Ne` -> exit 0.
- `git diff --check` -> exit 0.

## Test results

- Focused animation unit coverage passed.
- Contracts plus real integration coverage passed, including animated chalk render/cache reuse.
- Sample outputs completed successfully:
  - `/tmp/educational-renderer-chalk-samples-OpQ1Ne/preview/final/lesson.mp4`
  - `/tmp/educational-renderer-chalk-samples-OpQ1Ne/draft/final/lesson.mp4`
  - `/tmp/educational-renderer-chalk-samples-OpQ1Ne/youtube-short/final/lesson.mp4`
- FFprobe verified:
  - preview: H.264, 960x540, yuv420p, 15 fps, 12.400 s
  - draft: H.264, 1280x720, yuv420p, 24 fps, 12.419 s
  - youtube-short: H.264, 1080x1920, yuv420p, 24 fps, 12.419 s

## Known risks or follow-up work

- Visual quality depends on FFmpeg+librsvg text rendering; the chalk effect is stylistic layering rather than
  true raster brush simulation.
- Segment-based motion is stepwise rather than continuously interpolated.
- Full manual acceptance still depends on watching the generated videos to confirm the chalk-writing feel is
  subjectively strong enough.

## Recommended next steps

- If this mode is accepted, consider adding richer hand artwork and smoother intra-step motion without
  changing the package boundary.
