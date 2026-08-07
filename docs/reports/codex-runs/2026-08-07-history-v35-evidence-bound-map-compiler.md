# History V3.5 evidence-bound map compiler

## Root cause

Prompt and supplement-layer patches could not enforce map truth because `supplementMapIntentsV34` synthesized cross-claim routes (e.g. Moscow→Berezina for a retreat-only beat) and `compileMapStateV34` accepted planner-authored endpoints from episode-wide entity lookup. Validators only blocked defects after maps were already fabricated.

## Architecture

- `history-geo-facts-v35.ts`: extracts scoped `GeoFact` records (location, movement, sequence) with claim provenance and derives `MapCapabilities`.
- `history-map-compiler-v35.ts`: deterministic `compileMapStateV35` resolves requested semantics, downgrades safely, attaches `compilerResolution` metadata, and enforces schematic vs documented route geometry.
- `history-geo-v35.ts`: episode-scoped intent filtering; blocks unsupported endpoint leakage before compile.
- `visual-planner-v35.ts`: passes `scopeClaimIds` to compiler; scoped map cache keys prevent beat cross-contamination.
- `history-v34-contracts.ts`: additive `compilerResolution` on `HistoryMapStateV34`.
- `history-workflow-v35.ts`: approval pack exposes compiler diagnostics per map.

## Changed files

- `packages/history/src/history-geo-facts-v35.ts` (new)
- `packages/history/src/history-map-compiler-v35.ts` (new)
- `packages/history/src/history-map-compiler-v35.unit.test.ts` (new)
- `packages/history/src/history-geo-v35.ts`
- `packages/history/src/history-v34-contracts.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-workflow-v35.ts`
- `packages/history/src/index.ts`

## Invariants

- Movement maps require scoped movement facts (actor optional only when claim authorizes collective movement).
- Beat/segment `scopeClaimIds` bound all geographic facts; episode-context places cannot authorize routes.
- Unsupported movement requests downgrade to sequence or locator when multiple places exist, else compile refuses.
- Route geometry defaults to `schematic-progression` unless documented-path evidence exists.
- `MAP_ROUTE_ACTOR_UNSUPPORTED` retained as defense-in-depth in planner validation.

## Tests

```bash
pnpm exec vitest run -c vitest.unit.config.ts packages/history/src/history-map-compiler-v35.unit.test.ts
pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts
pnpm exec vitest run -c vitest.unit.config.ts packages/history/src/history-v35-franklin-geo.unit.test.ts
```

All passed (10/10 compiler cases A–H + Napoleon; corpus four-episode acceptance; Franklin geo).

## Napoleon regression

**Previous:** `beat-0035` / `map-state-0035` emitted `Moscow → Berezina River` route for claim “By October, Napoleon began the retreat.” with `MAP_ROUTE_ACTOR_UNSUPPORTED`.

**New:** `beat-0035` compiles no map (insufficient scoped geography); modality falls back to `archival image`. No Berezina route or `MAP_ROUTE_ACTOR_UNSUPPORTED` in regenerated Napoleon plan.

## Corpus regeneration (via acceptance run)

| Episode | Map blockers | MAP_ROUTE_ACTOR_UNSUPPORTED | Plan changed |
|---|---|---|---|
| Napoleon | none map-specific | 0 | yes (beat-0035 map removed) |
| Roman Empire | TEXT_ONLY resolved in prior work | 0 | yes |
| Black Death | none map-specific | 0 | yes |
| Franklin | none map-specific | 0 | yes |

## Remaining issues

- `EDITORIAL_REPETITION_THRESHOLD` and `TIMING_MEASUREMENT_REQUIRED` production blockers remain unrelated to map architecture.
- Retreat beat without scoped place now uses archival fallback rather than a Moscow locator; acceptable but could later add claim-bound locator when geography is structured into the claim.
