# Veronica production hardening follow-up

## Summary

Wired source-led adaptation into the episode pipeline, replaced 1×1 prepared-asset placeholders with deterministic raster synthesis for PDF/PPTX/image candidates, and added post-render output validation behind `VERONICA_FFMPEG_RENDER=1`.

## Changed paths

- `packages/strategic-reinvention/src/source-adaptation-bridge.ts`
- `packages/strategic-reinvention/src/source-adaptation-bridge.unit.test.ts`
- `packages/strategic-reinvention/src/episode-pipeline.ts`
- `packages/strategic-reinvention/src/pilot-fixture.ts`
- `packages/strategic-reinvention/src/index.ts`
- `packages/veronica-media/src/preparation/asset-rasterizer.ts`
- `packages/veronica-media/src/preparation/asset-rasterizer.unit.test.ts`
- `packages/veronica-media/src/rendering/output-validation.ts`
- `packages/veronica-media/src/rendering/output-validation.unit.test.ts`
- `packages/veronica-media/src/rendering/executor.ts`
- `packages/veronica-media/src/pipeline/orchestrator.ts`
- `packages/veronica-media/src/index.ts`
- `docs/architecture/veronica-supplemental-media/MERGE-STATUS.md`

## Tests

| Command | Result |
|---------|--------|
| `pnpm --filter @mediaforge/strategic-reinvention typecheck` | pass |
| `pnpm --filter @mediaforge/veronica-media typecheck` | pass |
| `pnpm test:focused -- packages/strategic-reinvention/src/source-adaptation-bridge.unit.test.ts` | pass |
| `pnpm test:focused -- packages/veronica-media/src/preparation/asset-rasterizer.unit.test.ts` | pass |
| `pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts` | not rerun (hook budget) |

## Risks

- Rasterizer is deterministic synthesis, not poppler/libreoffice extraction.
- Push may still require manual approval outside agent session.

## Follow-up

- Rerun `pilot.integration.test.ts` and `workflow.integration.test.ts`.
- Add CI job with `VERONICA_FFMPEG_RENDER=1` when host ffmpeg is available.
