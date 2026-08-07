# History V3.5 quality/gating remediation

## Summary
Fixed repetition signatures, historical production gating, Bronze Age entity/place resolution, diagram render-signature effective change, and visual-coverage diagnostics. Regenerated deterministic Episodes 01–05 approval packs.

## Parallel execution
Read-only investigations ran in parallel; implementation serialized on shared modules (`visual-planner-v35.ts`, `history-geo-v34.ts`, `history-claims-v34.ts`). Baseline dirty files from prior map-semantics session were preserved (no Veronica Benini files touched).

## Changed paths
- `packages/history/src/history-visual-repetition-v35.ts`
- `packages/history/src/history-effective-change-v35.ts`
- `packages/history/src/history-visual-semantics-v35.ts`
- `packages/history/src/history-visual-opportunity-v35.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/visual-planner-v35.ts`
- Tests: `history-visual-repetition-v35.unit.test.ts`, `history-effective-change-v35.unit.test.ts`, `history-v35-semantics.unit.test.ts`, `history-v35.unit.test.ts`

## Tests
- `history-visual-repetition-v35.unit.test.ts` — pass
- `history-effective-change-v35.unit.test.ts` — pass
- `history-v35-semantics.unit.test.ts` — pass
- `history-v35.unit.test.ts` — pass
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass, `planHashDeterministic: true`

## Artifacts
- `artifacts/chatgpt-review/history-approval-packs-v3.5.zip` SHA-256 `28bc0fe193635e3b5b3556f2d1361204acc13433a073f205578c03bc387e57db`
- `artifacts/chatgpt-review/history-approval-packs-v3.5/comparison-quality-report.json`

## Risks
- Episode 01 has 3 maps but diagram beats still 0 despite 10 eligible opportunities; compileDiagram trade-network anchor needs beat-level entity labels (follow-up).
- Corpus-wide `EDITORIAL_REPETITION_THRESHOLD` remains blocking (expected until visual diversification pass).
