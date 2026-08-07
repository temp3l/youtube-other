# History V3.5 map compiler hardening

## Summary

Hardened evidence-bound map compiler diagnostics, fallback ladder, and approval-pack GeoFact auditability without redesigning architecture.

## Changed files

- `packages/history/src/history-v34-contracts.ts` — `resolutionNotes`, `no-map` semantic type
- `packages/history/src/history-map-compiler-v35.ts` — fallback ladder, downgrade invariants, used geoFactIds
- `packages/history/src/history-geo-facts-export-v35.ts` — reviewable GeoFact export + integrity validation
- `packages/history/src/history-workflow-v35.ts` — `geo-facts.json` in approval packs
- `packages/history/src/visual-planner-v35.ts` — geo-fact referential integrity validation
- `packages/history/src/index.ts` — export new module
- `packages/history/src/history-map-compiler-v35.unit.test.ts` — regression matrix
- `packages/history/src/history-geo-facts-export-v35.unit.test.ts` — export integrity test

## Tests

- `pnpm exec vitest run -c vitest.unit.config.ts packages/history/src/history-map-compiler-v35.unit.test.ts` — pass (15)
- `pnpm exec vitest run -c vitest.unit.config.ts packages/history/src/history-geo-facts-export-v35.unit.test.ts` — pass (1)
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass

## Regeneration

- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass
- Combined ZIP SHA-256: `493383b1cf8ff5ea052559bbb6c4d3341394f93e628e1b7373e1b573ccc944cb` (final run after Franklin upgrade fix changed Franklin plan hash)

## Risks / follow-up

- Napoleon retreat beat has no scoped Moscow in trusted claims; no-map is evidence-correct unless claim structuring adds beat-bound geography.
- Unrelated blockers remain: `EDITORIAL_REPETITION_THRESHOLD`, `TIMING_MEASUREMENT_REQUIRED`.
