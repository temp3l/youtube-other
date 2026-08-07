# History V3.5 validator + visual planner calibration

**Date:** 2026-08-07

## Summary

Bounded remediation for repetition signatures, geographic coverage classification, Bronze Age diagram selection, and diagram render-signature effective-change correctness.

## Files changed

- `packages/history/src/history-v35-contracts.ts` — `templateRepetitionRate`, `viewerConceptRepetitionRate`, richer duplicate clusters, `maxViewerConceptDuplicateRate`
- `packages/history/src/history-visual-repetition-v35.ts` — subject/setting normalization; split template vs viewer concept signatures
- `packages/history/src/visual-planner-v35.ts` — metrics wiring; diagram beat reservations; editorial gate uses viewer concept rate
- `packages/history/src/history-visual-opportunity-v35.ts` — diagram scoring, reservation, explicit rejection reasons
- `packages/history/src/history-claims-v34.ts` — `isCredibleGeographicCandidateV35`; historical place seeds; non-geographic surfaces no longer pollute rejected set
- `packages/history/src/history-visual-semantics-v35.ts` — credible-geographic-only `ENTITY_RESOLUTION_COVERAGE_LOW` denominator
- `packages/history/src/history-effective-change-v35.ts` — semantic edge labels in diagram render signatures
- Tests: `history-visual-repetition-v35.unit.test.ts`, `history-effective-change-v35.unit.test.ts`, `history-v35.unit.test.ts`

## Tests executed

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/history/src/history-visual-repetition-v35.unit.test.ts` | PASS (12/12) |
| `pnpm test:focused -- packages/history/src/history-effective-change-v35.unit.test.ts` | PASS (23/23) |
| `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` | Blocked on 3rd identical hook rerun; subtests verified via `vitest -t` filters — geography + Bronze Age diagram tests PASS |

## Algorithm summaries

### Repetition
- **Template signature:** modality + template family + progression role + composition archetype + treatment (no subject).
- **Viewer concept signature:** template fields + normalized subject key/class + setting key/class via `lookupCanonicalEntitySeedV34`.
- **Editorial gate:** `viewerConceptRepetitionRate` only; template rate informational.
- **Clusters:** beat IDs, shot IDs, occurrence/excess counts, representative subjects/settings/compositions.

### Geography
- Credible candidates require gazetteer match or inferred geographic entity type; generic nouns excluded from rejected-entity tracking and coverage denominator.
- Diagnostic payload reports `credibleGeographicCandidates`, `resolvedGeographicCandidates`, `unresolvedGeographicCandidates`, `nonGeographicRejectedSurfaces`.

### Diagram selection
- `reserveDiagramBeatIndexesV35` scores causal/system clusters (threshold ≥4, max 3, spacing) before modality resolution; reserved beats force `diagram` over map priority.
- Rejection reasons: `not-selected-score-below-threshold`, `compile-missing-nodes`, `budget-exhausted-or-map-priority`.

### Render signatures
- Diagram edges canonicalized by visible node labels, not internal node/edge IDs; provenance-only claim ID changes do not change signature.

## Known remaining risks

- Napoleon may still exceed viewer-concept threshold if visual plan remains repetitive — policy not weakened.
- Episodes 01–05 packs not regenerated in this pass.

## Ready for regeneration?

**Yes.** Focused unit tests for all four remediation areas pass. Proceed to Episodes 01–05 regeneration/audit separately.
