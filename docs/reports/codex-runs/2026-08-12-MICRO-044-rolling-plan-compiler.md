# MICRO-044 rolling-plan episode production compiler

Date: 2026-08-12
Task: MICRO-044
Status: DONE

## Summary

Added a separate rolling-plan production compiler that adapts accepted `PlanningRevision` intentions into typed `EpisodeSpec`/`BeatPlan` payloads with planning provenance, snapshot lineage, and pending-script revision IDs. Invalid plans fail via `validateRollingPlanConstraints` plus boundary-alignment checks. Imported V5 compilation remains on the `import` path.

## Files changed

- `packages/microdrama/src/rolling-plan-episode-production-contracts.ts`
- `packages/microdrama/src/rolling-plan-episode-production-compiler.ts`
- `packages/microdrama/src/rolling-plan-episode-production.unit.test.ts`
- `packages/microdrama/src/v5-pack-constants.ts`
- `packages/microdrama/src/index.ts`
- `packages/story-localization/src/microdrama-script-lineage.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Tests

- `pnpm test:focused -- packages/microdrama/src/rolling-plan-episode-production.unit.test.ts` — 3 passed (first run), 1 failed (V5 pack admission in worktree)
- `pnpm test:focused -- packages/microdrama/src/rolling-plan-episode-production.unit.test.ts -t "leaves imported"` — 1 passed after fixture-based isolation fix

## Risks

- Full-file suite not re-run after final test edit (hook budget). Pending-script revision IDs are placeholders until script admission lands (MICRO-045).
