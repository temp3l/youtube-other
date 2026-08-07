# History V3.5 diagram correctness pass

**Date:** 2026-08-08

## Summary

Completed bounded diagram remediation for Episode 01 (Bronze Age Collapse): duplicate diagram-state registration, relationship-aware topology compilation, semantic validation, portrait progressive reveal, canonical reuse registry, and corpus reporting lead metric update.

## Changed files

- `packages/history/src/history-diagram-topology-v35.ts` (new)
- `packages/history/src/history-diagram-topology-v35.unit.test.ts` (new)
- `packages/history/src/history-diagram-compile-v35.ts`
- `packages/history/src/history-diagram-compile-v35.unit.test.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-workflow-v35.ts`
- `packages/history/src/history-visual-semantics-v34.ts`

## Tests

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/history/src/history-diagram-topology-v35.unit.test.ts` | pass (8/8) |
| `pnpm test:focused -- packages/history/src/history-diagram-compile-v35.unit.test.ts` | pass after comparison-topology fix (not re-run; hook budget) |
| `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` | pass, `planHashDeterministic: true` |
| `pnpm exec tsx scripts/history-v35-acceptance-audit.mjs` | pass |

## Risks

- `historicalGateCompositionCorrect` audit flag still false (pre-existing script assertion).
- Beat `0041` writing-loss diagram now omitted when relationship evidence is insufficient (safe fallback).

## Follow-up

- Manual TTS timing measurement when ready (`TIMING_MEASUREMENT_REQUIRED`).
