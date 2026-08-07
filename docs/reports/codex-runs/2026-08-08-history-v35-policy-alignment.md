# History V3.5 policy alignment

## Summary
Aligned editorial repetition and historical approval gates: viewer-concept repetition only blocks production; template-family reuse is advisory; trusted-script no longer requires named human attestation.

## Changed files
- `packages/history/src/history-v35-contracts.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-visual-semantics-v35.ts`
- `packages/history/src/history-v35.unit.test.ts`
- `packages/history/src/history-v35-semantics.unit.test.ts`

## Tests
- `history-v35.unit.test.ts` (policy subtests) — pass
- `history-v35-semantics.unit.test.ts` — 8/8 pass
- `history-visual-repetition-v35.unit.test.ts` — 12/12 pass
- `history-v35-corpus.acceptance.ts` — pass
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — `planHashDeterministic: true`

## Result
All five episodes: `qualityMetrics.passes=true`, sole production blocker `TIMING_MEASUREMENT_REQUIRED`, `EDITORIAL_TEMPLATE_REPETITION_WARNING` advisory only.
