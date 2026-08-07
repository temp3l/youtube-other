# History V3.5 Episodes 01–05 regeneration + acceptance audit

## Summary
Closed three residual implementation items, regenerated canonical Episodes 01–05 with deterministic hashes, and completed acceptance audit. Fixed missing `refineVisualTreatmentPlanV35` import, Eastern Europe place seed, pack path sanitization, and provenance-only diagram clock resets.

## Changed files
- `packages/history/src/visual-planner-v35.ts` — import treatment refine
- `packages/history/src/history-geo-v34.ts` — place seeds (Eastern Europe, North America, Napoleon geographies)
- `packages/history/src/history-workflow-v35.ts` — sanitize test-summary diagnostics
- `packages/history/src/history-effective-change-v35.ts` — suppress clock reset on unchanged diagram render
- `scripts/history-v35-acceptance-audit.mjs` — audit helper (new)

## Tests
- `history-diagram-compile-v35.unit.test.ts` — 3/3 pass
- `history-visual-treatment-refine-v35.unit.test.ts` — 1/1 pass
- `history-v35.unit.test.ts` (geography filters) — 2/2 pass
- `history-v35-corpus.acceptance.ts` — pass
- `history-effective-change-v35.unit.test.ts` (provenance-only) — pass
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — `planHashDeterministic: true`

## Risks / follow-up
- `EDITORIAL_REPETITION_THRESHOLD` still fires on **template** repetition (~60–67%) while **viewer-concept** rate is healthy (~5–8%). Policy decoupling or visual-plan diversity work remains separate.
- `TIMING_MEASUREMENT_REQUIRED` expected until measured TTS exists.
