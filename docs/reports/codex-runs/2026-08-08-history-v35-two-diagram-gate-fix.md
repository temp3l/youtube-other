# History V3.5 two-diagram + gate-consistency fix

## Summary
Implemented evidence-window progressive diagrams for Rome and Black Death labour chains, unified diagram semantic validation via `finalizeDiagramSemanticStateV35`, and added planning-stage expected-blocker gating (`TIMING_MEASUREMENT_REQUIRED` only).

## Changed files
- `packages/history/src/history-diagram-evidence-v35.ts` (new)
- `packages/history/src/history-diagram-semantic-v35.ts` (new)
- `packages/history/src/history-planning-acceptance-v35.ts` (new)
- `packages/history/src/history-diagram-evidence-v35.unit.test.ts` (new)
- `packages/history/src/history-diagram-compile-v35.ts`
- `packages/history/src/history-v34-contracts.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts`
- `scripts/history-v35-acceptance-audit.mjs`

## Tests run
- `pnpm test:focused -- packages/history/src/history-diagram-evidence-v35.unit.test.ts` — pass (9/9)
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass, deterministic
- `pnpm exec tsx scripts/history-v35-acceptance-audit.mjs` — pass

## Results
All Episodes 01–05: production blockers = `TIMING_MEASUREMENT_REQUIRED` only. Rome `DIAGRAM_UNSUPPORTED_CAUSAL_SEQUENCE` and Black Death `DIAGRAM_UNSUPPORTED_EDGE` eliminated. Planning acceptance passes all episodes.

## Risks
Black Death beat-0033 diagram uses beats 0032–0033 window (labour scarcity → wage pressure); demographic-shock node requires beat-0031 in window if a three-node consequence state is desired on that beat.

## Follow-up
TTS generation → measured timing → authoritative timestamp regeneration.
