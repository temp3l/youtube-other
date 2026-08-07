# Franklin V3.4 pipeline fix

**Date:** 2026-08-07  
**Source:** Phase 01 (`prompts/history-v34-cursor/01-franklin-golden-fixture.md`)

## Summary

Franklin Expedition now passes `franklin-v34.acceptance.ts`. Map supplements (outbound, Baffin Bay, Beechey wintering, King William entrapment, wreck discoveries), orientation compile fixes, evidence diagram, contextual temporal resolution, and 21st-century year parsing were added.

## Files changed

- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/visual-planner-v34.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-workflow-v34.ts` (prior `ensureTrustedAttestation` fix)
- `packages/history/test/acceptance/franklin-v34.acceptance.ts`
- `vitest.acceptance.config.ts`, `scripts/test-focused.sh`

## Tests

```bash
pnpm --filter @mediaforge/history typecheck  # exit 0
pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts  # exit 0
pnpm test:focused -- packages/history/src/history-v34.unit.test.ts  # exit 0
```

## Risks

- Franklin-specific map supplements may need generalization for Napoleon/Rome/Black Death in Phase 02–03.
- Nine map states include some duplicate routes; portfolio tuning may consolidate later.

## Follow-up

Phase 02 Napoleon fixture acceptance test; protect Franklin test in CI.
