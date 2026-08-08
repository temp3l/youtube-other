# Diagram node semantic fidelity fix

## Summary
Fixed cross-episode diagram label contamination by requiring claim-grounded labels in thematic extraction and moving Black Death transmission to evidence-bound compilation with plague-specific gating.

## Root cause
`THEMATIC_CAUSAL_LABELS` used broad regex alternations (e.g. `empire|administration|resources`, `intelligence|discipline|diplomacy`) that matched unrelated episode claims and emitted hardcoded template labels. Black Death transmission in `visual-planner-v35.ts` fell back to four fixed labels when generic `disease` + `ships`/`trade` co-occurred.

## Files changed
- `packages/history/src/history-diagram-compile-v35.ts`
- `packages/history/src/history-diagram-evidence-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-diagram-compile-v35.unit.test.ts`
- `packages/history/src/history-diagram-evidence-v35.unit.test.ts`

## Tests
- `pnpm test:focused -- packages/history/src/history-diagram-evidence-v35.unit.test.ts` — 12 passed
- `pnpm test:focused -- packages/history/src/history-diagram-compile-v35.unit.test.ts` — 8 passed

## Risks
Bronze Age / metanarrative diagrams rely on tighter grounding; portfolio regeneration not run in this task.
