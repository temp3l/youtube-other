# Entity Resolution Generic Geography Subspan Remediation

**Date:** 2026-08-08

## Root cause

1. `inferHistoricalEntitySeedFromSurfaceV34` assigned `water-body` to single-token generic head nouns (`Bay`, `Sea`, …) before geographic-context checks, so title-case extraction of `Bay` inside `Bay of Pigs` produced a spurious inferred entity.
2. `GEOGRAPHIC_OF_PHRASE_PATTERN_V35` used the `/i` flag, letting `[A-Z]` match lowercase tails (e.g. `failed` in `Bay of Pigs failed`).
3. No span-aware suppression existed for generic geographic subspans inside longer geographic or institutional phrases.
4. Inferred seeds pre-set on candidates were labeled `deterministic`, and `geographicFromEntities` treated all credible inferred geography as required map geography.

## Resolution strategy

- Added generic head-noun detection, geographic-`X of Y` extraction, institutional-title extraction, and `shouldSuppressGenericGeographicSubspanV35` span containment in entity resolution.
- Hardened inference: generic head nouns require independent geographic context and reject `X of Y` subspans.
- Restricted geographic qualifiers to canonical registry geography only; inferred named geography remains as entities without `REQUIRED_GEOGRAPHY_MISSING` pressure.

## Files changed

- `packages/history/src/history-entity-resolution-v35.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-entity-resolution-v35.unit.test.ts`

## Tests run

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/history/src/history-entity-resolution-v35.unit.test.ts` | 50/50 pass |
| `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` | 16/16 pass |
| `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` | 30/30 pass |
| `pnpm exec tsc -p packages/history/tsconfig.json --noEmit` | pass |

## Episode results (08, 10, 11)

- **08 Cuban Missile Crisis:** `contentApprovalEligible: true`; entity `Bay of Pigs` retained; no `Bay` / `REQUIRED_GEOGRAPHY_MISSING:Bay`.
- **10 Titanic:** `contentApprovalEligible: true`; `International Convention for the Safety of Life at Sea` retained; no `Sea` geography entity/blocker.
- **11 Pompeii:** `contentApprovalEligible: true`; `Bay of Naples` retained; no standalone `Bay`.

## Corpus

`history-v35-corpus.acceptance.ts` passes **30/30** episodes (repo discovery range 1–30). No `REQUIRED_GEOGRAPHY_MISSING:Bay` or `:Sea` false blockers. `TIMING_MEASUREMENT_REQUIRED` remains expected on production packs.

## Risks / follow-up

- Inferred but non-canonical named geography (e.g. `Bay of Pigs`) is an entity only; map placement still needs canonical `PLACE_SEEDS` if required-map coverage is desired later.
- Commit: uncommitted at report time (working tree).
