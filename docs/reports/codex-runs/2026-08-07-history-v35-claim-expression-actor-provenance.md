# History V3.5 claim-expression actor provenance fix

## Root cause

`resolveMovementActorRefV35()` fell back to synthetic `narrated expedition` when no entity or pattern matched, allowing movement GeoFacts and routes to compile with placeholder actor authority.

## Fix

Actor resolution now returns `resolved | unresolved`. Claim-expression actors require positive text extraction with `sourceText` (+ optional `sourceSpan`). Movement GeoFacts are omitted when actor resolution fails, triggering existing sequence/locator fallback.

## Validation

- Unit tests: 21 pass (actor + map compiler)
- Corpus acceptance: pass
- Regenerated four-episode v3.5 packs
- `MAP_ROUTE_ACTOR_UNSUPPORTED = 0` across corpus

## Regeneration

ZIP SHA-256: `66c3d02517dbedf460282a36616ff321cb1bc956627a6afc63f66ac81b744708`
