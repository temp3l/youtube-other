# History V3.5 P0 Bounded Remediation

**Date:** 2026-08-08

## Root causes fixed

1. **Composite episode topics** — Title strings like "Fall of the Roman Empire" / "Caesar in Gaul" were treated as single canonical entities; now resolved via constituent subjects (Roman Empire + Rome, Julius Caesar + Gaul/Pompey).
2. **Great Heathen Army recall** — Inferred military-unit seeds were dropped when absent from alias map; extraction now infers multi-token Army names and registers `Great Heathen Army`.
3. **Geographic place resolution** — `North Africa`, `Pearl Harbor`, `Hawaii`, `Southeastern Europe`, `Western Asia`, `Asia Minor` added to `PLACE_SEEDS` for map/geo-facts canonicalization.
4. **D-Day diagram contamination** — Napoleon army-size template triggered on logistics text containing "reinforcements"; gated to Napoleonic campaign context only.
5. **Corpus vs episode validation** — `FOCUSED_TEST_FAILURE` no longer applied to individual episode plan structural approval; corpus failures recorded in `test-summary.json` via `enrichCorpusTestSummaryV35`.
6. **Geographic coverage denominator** — Normalized rejected spans; `Republic` classified non-geographic; Caesar slug handlers split per episode.

## Files changed

- `packages/history/src/history-core-subject-v35.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-entity-resolution-v35.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/history-workflow-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-core-subject-v35.unit.test.ts`
- `packages/history/src/history-v35.unit.test.ts`

## Focused validation

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/history/src/history-core-subject-v35.unit.test.ts` | 31/31 pass |
| `pnpm test:focused -- packages/history/src/history-entity-resolution-v35.unit.test.ts` | 44/44 pass |
| `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` | 15/15 pass |
| `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` | **FAIL** ep 01 |

## Corpus result

Fails on `history-youtube-history-10-video-story-pack-01-bronze-age-collapse` with unexpected production blockers `REQUIRED_GEOGRAPHY_MISSING:Greece`, `REQUIRED_GEOGRAPHY_MISSING:Linear` (outside P0 episode set; pre-existing geography gate on Bronze Age maps).

## Remaining blockers

- Corpus acceptance blocked at episode 01 (geography representation on Bronze Age map beats — not in P0 scope).
- Episode regeneration for the nine P0 episodes not run as full approval packs in this session (plans regenerate on `planHistoryVisualsV35({ force: true })` during acceptance).
- `TIMING_MEASUREMENT_REQUIRED` expected on production packs.
