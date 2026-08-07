# History V3.4 narrow semantics remediation

## Summary
Fixed route-purpose direction, sighting-vs-movement map grounding, discovery-location evidence requirements, >12s text-only production blockers, and attestation timestamp semantics. Regenerated Franklin review bundle.

## Changed files
- `packages/history/src/history-visual-semantics-v34.ts`
- `packages/history/src/history-geo-v34.ts`
- `packages/history/src/visual-planner-v34.ts`
- `packages/history/src/history-workflow-v34.ts`
- `packages/history/src/history-trusted-script-v33.ts`
- `packages/history/src/history-v34-semantics.unit.test.ts`
- `packages/history/src/history-v34.unit.test.ts`
- `packages/history/test/acceptance/franklin-v34.acceptance.ts`

## Tests
- `pnpm --filter @mediaforge/history build` — pass
- `pnpm test:focused -- packages/history/src/history-v34-semantics.unit.test.ts` — 12/12
- `pnpm test:focused -- packages/history/src/history-v34.unit.test.ts` — 5/5
- `pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts` — pass

## Readiness
`READY_FOR_HISTORY_BULK_REGENERATION` — planner semantics resolved; Franklin production remains blocked on measured timing, local verification, and unjustified long text-only beats.
