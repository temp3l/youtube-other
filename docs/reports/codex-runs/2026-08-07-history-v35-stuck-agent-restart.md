# History V3.5 stuck agent restart

## Summary
Terminated stuck agent `fa1473d1` (PID 3445008, 60+ min, 33% CPU, no shell children). Fixed corpus regressions from permissive entity inference and restored green `history-v35-corpus.acceptance.ts`.

## Why it was stuck
Edit/debug spiral: visual-repetition scope, blocked ad-hoc `tsx -e`, garbage geographic entities from infer hook (`Russian`, `Each French`, `Fires`), repeated planner edits without converging acceptance.

## Changed files
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-map-compiler-v35.ts`
- `packages/history/src/history-geo-v34.ts`
- `prompts/history-v35-cursor/00-restart-handoff.md`

## Tests
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass

## Risks
- `history-v35.unit.test.ts` may fail (bronze infer tests); not run this session.
- Portfolio regeneration and Franklin narration fixes still pending.

## Next
Fresh agent: "Read and follow prompts/history-v35-cursor/00-restart-handoff.md"
