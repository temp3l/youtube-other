# History V3.4 final cleanup

## Summary
Resolved long text-only remediation, authoritative validation export consistency, and contextual map-label provenance. Regenerated Franklin review pack with passing focused verification.

## Changed files
- `packages/history/src/history-visual-semantics-v34.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/visual-planner-v34.ts`
- `packages/history/src/history-workflow-v34.ts`
- `packages/history/src/history-v34-contracts.ts`
- `packages/history/src/history-v34-semantics.unit.test.ts`
- `packages/history/test/acceptance/franklin-v34.acceptance.ts`

## Tests
- `pnpm --filter @mediaforge/history build` — pass
- `pnpm test:focused -- packages/history/src/history-v34-semantics.unit.test.ts` — 15/15
- `pnpm test:focused -- packages/history/src/history-v34.unit.test.ts` — 5/5
- `pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts` — pass
- `pnpm exec tsc -p packages/history/tsconfig.json --noEmit` — pass

## Franklin
- `artifacts/chatgpt-review/history-youtube-history-10-video-story-pack-05-franklin-expedition-v3.4`
- planHash `765276a6630f54545bce246ecc4683908e8811a3d11054bad60726a7a4b3aa9e`

## Risks
- Episode production remains blocked on measured TTS (`TIMING_MEASUREMENT_REQUIRED`).
