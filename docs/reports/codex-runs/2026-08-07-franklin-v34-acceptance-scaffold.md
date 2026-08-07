# Franklin V3.4 acceptance test scaffold

**Date:** 2026-08-07  
**Source:** Phase 01 start (`prompts/history-v34-cursor/01-franklin-golden-fixture.md`)

## Summary

Scaffolded the Franklin generated-artifact acceptance test and minimal infrastructure to run it. Fixed missing `ensureTrustedAttestation` declaration so workflow code compiles. Test fails on `mapStates.length >= 4` (current: 2).

## Files changed

- `packages/history/test/acceptance/franklin-v34.acceptance.ts` (created)
- `vitest.acceptance.config.ts` (created)
- `scripts/test-focused.sh` (added `*.acceptance.ts` support)
- `packages/history/src/history-workflow-v34.ts` (restored `ensureTrustedAttestation` declaration)

## Tests run

```bash
pnpm --filter @mediaforge/history typecheck          # exit 0
pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts  # exit 1
pnpm test:focused -- packages/history/src/history-v34.unit.test.ts              # exit 0
```

Acceptance failure: `expected 2 to be greater than or equal to 4` at `mapStates.length`.

## Risks / follow-up

Implement pipeline fixes for maps (4+), diagrams (1+), repetition thresholds, pacing (opening updates), entity/qualifier coverage until acceptance passes.
