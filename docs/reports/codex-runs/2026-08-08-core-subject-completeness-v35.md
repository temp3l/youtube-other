# Core subject completeness (Worker B)

## Summary
Unresolved core subjects now always emit `CORE_ENTITY_UNRESOLVED`; recall failures are additive. Slug derivation covers packs 11/14/17/20/25. Core diagnostics use editorial gate so both approval flags block.

## Changed files
- `packages/history/src/history-core-subject-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-core-subject-v35.unit.test.ts`

## Tests
`pnpm test:focused -- packages/history/src/history-core-subject-v35.unit.test.ts` — exit 1 (22/27 pass). All core-subject, slug-coverage, Caesar, Cleopatra planner-gate tests pass. One unrelated Mongol diagram edge-count test fails (pre-existing diagram compiler scope).

## Risks
Mongol diagram edge regression remains open for Worker C. Pompey/Maya lack canonical seeds (slug labels only).
