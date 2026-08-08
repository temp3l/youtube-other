# History V3.5 production render adapter

## Summary
Implemented `compileHistoryRenderDerivativeV35` and wired History production to consume V3.5 shot timing instead of the legacy 16-scene split when `source/history-v3.5/plan.json` exists.

## Changed files
- `packages/history/src/history-render-adapter-v35.ts` (new)
- `packages/history/src/history-render-adapter-v35.unit.test.ts` (new)
- `packages/history/src/task-registry.ts`
- `packages/history/src/visual-planner.ts`
- `packages/history/src/index.ts`
- `apps/cli/src/index.ts`

## Tests
- `pnpm test:focused -- packages/history/src/history-render-adapter-v35.unit.test.ts` — passed (2/2)

## Risks / follow-up
- Compiled modalities (map/diagram/timeline) still rely on image-generation `skipIllustration`; dedicated compiled-asset render path not implemented.
- Napoleon needs V3.5 approval (`--planner-version v3.5 --plan-hash … --derivative-hash …`) before `images generate` passes the gate.
- `TIMING_MEASUREMENT_REQUIRED` remains on Napoleon V3.5 plan until audio reconciliation updates the plan.
