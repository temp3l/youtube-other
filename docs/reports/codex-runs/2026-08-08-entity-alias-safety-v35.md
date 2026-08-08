# Entity alias safety V3.5

## Summary
Fixed P0 lexical alias safety: lowercase pronoun `us` no longer resolves to United States; qualified `America` subspans blocked; explicit `US`/`U.S.` still resolve. Extended discourse prefix tokens.

## Root cause
`extractEntitiesForUnit` lowercases unit text and uses `indexOf` on alias keys. The `us` key (from `US`) matched the pronoun `us` at word boundaries. `isSafeCanonicalEntityAliasMatchV35` had no United States guards.

## Files changed
- `packages/history/src/history-entity-resolution-v35.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-entity-resolution-v35.unit.test.ts`

## Tests
`pnpm test:focused -- packages/history/src/history-entity-resolution-v35.unit.test.ts` — 23 passed

## Risks
Standalone `America` in multi-region text still resolves; only qualified subspans are blocked.
