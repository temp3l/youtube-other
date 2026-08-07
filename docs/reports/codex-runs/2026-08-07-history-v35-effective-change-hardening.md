# History V3.5 effective-change and treatment-family hardening

**Date:** 2026-08-07  
**Commit:** `70bab8171bbb397ccb5e571f378fca77f84d4f98`

## Summary

Hardened `effectiveChange` to require structured perceptual/informational deltas, split semantic vs treatment duplication metrics, added audit counters to approval packs, and added a narrow treatment-refinement pass that merges motion-only splits, injects annotation-backed state changes, and balances camera distribution.

## Changed files

- `packages/history/src/history-effective-change-v35.ts` (new)
- `packages/history/src/history-effective-change-v35.unit.test.ts` (new)
- `packages/history/src/history-visual-treatment-refine-v35.ts` (new)
- `packages/history/src/history-visual-repetition-v35.ts`
- `packages/history/src/history-visual-semantics-v35.ts`
- `packages/history/src/history-v35-contracts.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-workflow-v35.ts`

## Tests

- `pnpm test:focused -- packages/history/src/history-effective-change-v35.unit.test.ts` — pass (20)
- `pnpm test:focused -- packages/history/src/history-visual-repetition-v35.unit.test.ts` — pass (8)
- `pnpm test:focused -- packages/history/src/history-map-actor-v35.unit.test.ts` — pass (6)
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass

## Corpus regeneration

`pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — `planHashDeterministic: true`

## Risks

- `TIMING_MEASUREMENT_REQUIRED` remains on all episodes (out of scope).
- Corrected long-static shares are materially higher (~27–35%); thresholds unchanged and all episodes still pass.
