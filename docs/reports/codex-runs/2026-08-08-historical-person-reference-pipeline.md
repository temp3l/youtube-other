# Historical person reference-image pipeline

## Summary
Added curated historical-person reference registry, shot-level likeness policy, conditional image-prompt attachment, approval-pack visibility, and a high-signal validation gate for missing face-relevant references.

## Changed paths
- `packages/history/src/history-person-reference-v35.ts`
- `packages/history/src/history-person-likeness-v35.ts`
- `packages/history/src/history-v35-contracts.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-render-adapter-v35.ts`
- `packages/history/src/history-workflow-v35.ts`
- `packages/history/src/index.ts`
- `packages/history/assets/person-references/**`
- `packages/image-generation/src/history-image-plan.ts`
- `packages/image-generation/src/history-person-reference-images.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- Tests: `history-person-likeness-v35.unit.test.ts`, `history-person-reference-images.unit.test.ts`, `history-render-adapter-v35.unit.test.ts`

## Validation
- `pnpm test:focused -- packages/history/src/history-person-likeness-v35.unit.test.ts` — pass (5)
- `pnpm test:focused -- packages/image-generation/src/history-person-reference-images.unit.test.ts` — pass (2)
- `pnpm test:focused -- packages/history/src/history-render-adapter-v35.unit.test.ts` — pass (2)
- `pnpm test:focused -- packages/image-generation/src/history-image-cinematography.unit.test.ts` — pass (10)
- `pnpm --filter @mediaforge/history typecheck` — pass
- `pnpm --filter @mediaforge/image-generation typecheck` — pending if blocked

## Risks / follow-up
- Seed PNGs are placeholders; expand registry assets and provenance before production likeness use.
- `@mediaforge/history` build required before downstream packages consume new exports from `dist`.
