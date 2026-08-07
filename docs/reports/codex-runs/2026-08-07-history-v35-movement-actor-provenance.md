# History V3.5 movement actor provenance hardening

## Root cause

`collectiveMapActor()` in the map compiler hardcoded `HMS Erebus and HMS Terror` whenever scoped claim text matched `two Royal Navy ships`, even when ship-name entities lived only on adjacent unscoped claims. Display labels were therefore free text with `movingActorEntityMentionId: null`.

## Changed files

- `packages/history/src/history-map-actor-v35.ts` — scoped actor resolution
- `packages/history/src/history-geo-facts-v35.ts` — `MovementFactV35.actorRef`
- `packages/history/src/history-map-compiler-v35.ts` — provenance-bound route actors
- `packages/history/src/history-v34-contracts.ts` — `MovementActorRefV35`, route `actorProvenance`
- `packages/history/src/history-geo-facts-export-v35.ts` — auditable actor fields in geo-facts
- `packages/history/src/history-map-actor-v35.unit.test.ts`
- `packages/history/src/history-map-compiler-v35.unit.test.ts`

## Tests

- `pnpm exec vitest run -c vitest.unit.config.ts packages/history/src/history-map-actor-v35.unit.test.ts` — pass (3)
- `pnpm exec vitest run -c vitest.unit.config.ts packages/history/src/history-map-compiler-v35.unit.test.ts` — pass (15)
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass

## Regeneration

- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass
- Franklin plan hash: `f9a3668e137bfb803f69986e06e1dd95c4b1916063c09edb816d0f0ce0d96c0e`
- Combined ZIP SHA-256: `598dac3c52773f122f563c4f2979dacd5aee2ec38fa5828274d10f92156cbe25`

## Risks

Unrelated blockers remain: `EDITORIAL_REPETITION_THRESHOLD`, `TIMING_MEASUREMENT_REQUIRED`.
