# Veronica Supplemental Media — Merge Status

## Session

- Branch: `veronica-media-integration-v2`
- Pack: `prompts/veronica-media-integration-agentic-goal-v2`
- Coordinator session: `veronica-media`

## Files modified (Veronica-owned)

- `packages/veronica-media/**` — supplemental media package, render executor, VMB-420 e2e fixtures
- `apps/cli/src/veronica-media-commands.ts` — `pilot|run|validate|render`
- `apps/cli/src/workflow-commands.ts` — full `strategic-episode` DAG (20 tasks)
- `packages/strategic-reinvention/src/**` — full task defs, episode pipeline, bridge, publishing, pilot fixture
- `packages/youtube-upload/src/multilingual-audio-capability.ts`
- `docs/architecture/strategic-reinvention/operator-guide.md`

## Adapters introduced

- `packages/veronica-media/src/rendering/executor.ts` — explicit `--execute` FFmpeg gate
- `packages/veronica-media/src/fixtures/e2e-scenarios.ts` — VMB-420 scenario matrix
- `packages/strategic-reinvention/src/full-task-definitions.ts` — full episode DAG
- `packages/strategic-reinvention/src/source-adaptation-bridge.ts` — source-led adaptation wiring + JSON manifest loading
- `packages/veronica-media/src/review-pack/bulk-aggregate.ts` — cross-episode approval rollup
- `packages/veronica-media/src/preparation/external-rasterizer.ts` — pdftoppm/LibreOffice with synthetic fallback
- `packages/veronica-media/src/rendering/output-validation.ts` — post-render artifact checks
- `packages/strategic-reinvention/src/multilingual-package.ts`
- `packages/strategic-reinvention/src/publishing.ts`
- `packages/strategic-reinvention/src/pilot-fixture.ts`
- `packages/youtube-upload/src/strategic-publish-routing.ts`

## Deferred extraction/generalization

- Generic visual-plan base extraction from history v3.5
- External PDF/PPTX renderer integration — **partial**: `external-rasterizer.ts` probes pdftoppm/LibreOffice with synthetic fallback
- Measured FFmpeg render validation — **done**: `pnpm verify:veronica-ffmpeg`
- Source manifest JSON loading — **done**: `sources/manifests/{sourceId}.json` with hash validation
- Bulk cross-episode approval aggregation — **done**: `exportBulkVeronicaApprovalReview`

## Tests to rerun after merge

```bash
pnpm test:focused -- packages/veronica-media/src/fixtures/pilot.unit.test.ts
pnpm test:focused -- packages/veronica-media/src/fixtures/e2e.integration.test.ts
pnpm test:focused -- packages/strategic-reinvention/src/workflow.integration.test.ts
pnpm test:focused -- packages/strategic-reinvention/src/pilot.integration.test.ts
pnpm test:focused -- apps/cli/src/workflow-commands.unit.test.ts
```
