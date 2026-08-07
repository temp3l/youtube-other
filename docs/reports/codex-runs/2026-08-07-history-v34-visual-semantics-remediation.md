# History V3.4 visual semantics remediation

## Summary
Implemented generic History V3.4 visual-semantics fixes (maps, diagrams, purposes, shots, provenance, gates) and regenerated the Franklin Expedition approval bundle.

## Changed files
- `packages/history/src/history-visual-semantics-v34.ts` (new)
- `packages/history/src/history-v34-contracts.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/visual-planner-v34.ts`
- `packages/history/src/history-workflow-v34.ts`
- `packages/history/src/index.ts`
- `packages/history/src/history-v34-semantics.unit.test.ts` (new)
- `packages/history/src/history-v34.unit.test.ts`
- `packages/history/test/acceptance/franklin-v34.acceptance.ts`

## Tests
- `pnpm --filter @mediaforge/history build` — pass
- `pnpm test:focused -- packages/history/src/history-v34-semantics.unit.test.ts` — 10/10 pass
- `pnpm test:focused -- packages/history/src/history-v34.unit.test.ts` — 5/5 pass
- `pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts` — pass

## Franklin regeneration
- Bundle: `artifacts/chatgpt-review/history-youtube-history-10-video-story-pack-05-franklin-expedition-v3.4.zip`
- `planHash`: `8f0b212ed7d21eeae195c88b3dc79840cc455815a78ccfd6009c580be77cfd3c`
- 8 map states; no identity routes; 2 discovery-location maps; evidence-set diagram with 0 edges
- Production blocked: `TIMING_MEASUREMENT_REQUIRED`, `LOCAL_VERIFICATION_PENDING`

## Risks / follow-up
- 33 editorial warnings remain (long static shots); measured audio still required for production approval.
