# Geographic qualification propagation remediation

## Root cause

The prior Bay/Sea entity-resolution fix added `isCanonicalGeographicEntityLabelV34()` as a gate in `geographicFromEntities()`. That function only checks `CANONICAL_ENTITY_SEEDS` (`ENTITY_BY_ALIAS`), not `PLACE_SEEDS`. Legitimate geography such as `Greece`, `Bay of Pigs`, and `Bay of Naples` was extracted and classified correctly but **denied geographic qualifiers** because it was `deterministic-inferred` or absent from canonical seeds. Downstream geo facts, map eligibility, and map states collapsed (~97 qualifiers, 10 map states).

Span-aware suppression was correct; qualifier propagation was not.

## Fix

1. Removed the canonical-only qualifier gate; eligibility now uses existing `isCredibleGeographicCandidateV35()` only.
2. Restored `confidenceSource` to seed-alias lookup (no geographic discrimination).
3. Added `findSurvivingGeographicEntitiesMissingQualifiersV35()` and corpus invariant.
4. Added place/canonical seeds: `Bay of Pigs`, `Bay of Naples`, `Berlin`, `Turkey`.
5. `validateRequiredGeographyCoverageV35` now requires map labels only when `resolveHistoryPlaceV34()` succeeds (seeded geography). Prevents false `REQUIRED_GEOGRAPHY_MISSING` for unseeded labels while keeping Bay/Sea suppression strict.

## Files changed

- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/history-visual-semantics-v35.ts`
- `packages/history/src/history-entity-resolution-v35.unit.test.ts`
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts`

## Tests

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/history/src/history-entity-resolution-v35.unit.test.ts` | 55/55 pass |
| `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` | 16/16 pass |
| `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` | 1/1 pass |
| `pnpm exec tsc -p packages/history --noEmit` | pass |

Propagation cases A–E added in entity-resolution unit tests.

## Corpus metrics (40 plans on disk)

| Metric | Pre–entity-fix | Regression | After remediation |
|--------|----------------|------------|-------------------|
| geographic qualifiers | 586 | 482 | **551** |
| map states | 54 | 44 | **53** |

## Affected episodes (maps)

| Ep | Before fix | Regression | After |
|----|------------|------------|-------|
| 01 | 2 | 1 | **2** |
| 08 | 3 | 2 | **3** |
| 11 | 1 | 0 | **1** |
| 16 | 2 | 1 | **2** |
| 18 | 4 | 0 | **4** |
| 29 | 1 | 0 | **1** |
| 34 | 2 | 1 | **1** |

Episode 34 remains at 1 map (likely unseeded `Asia`/`Manchuria`); out of scope.

## Acceptance

- 40/40 `contentApprovalEligible`
- 30/30 corpus semantic invariants (discovery range 1–30)
- No `REQUIRED_GEOGRAPHY_MISSING:Bay` or `:Sea` on episodes 08, 10, 11
- `TIMING_MEASUREMENT_REQUIRED` unchanged (expected production blocker)
- No episode whitelists; `deterministic-inferred` not globally rejected

## Artifacts

Plans regenerated at `episodes/<episode-id>/source/history-v3.5/plan.json` (corpus `force: true`). Combined approval-pack CLI failed on unrelated `veronica-media` import; use per-episode plans for review.

## Commit

`56d0129` (working tree; uncommitted)

## Risks / follow-up

- Unseeded credible geography receives qualifiers but is not map-mandatory until gazetteer entry exists.
- Episode 34 map count still below historical baseline; add seeds only if editorially required.
