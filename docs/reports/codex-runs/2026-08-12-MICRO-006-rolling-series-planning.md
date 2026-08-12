# MICRO-006 rolling series planning

Date: 2026-08-12
Task: MICRO-006
Status: DONE

## Goal

Add revisioned macro/arc/near-horizon/current-episode planning over accepted snapshots with deterministic constraints.

## Files changed

- `packages/microdrama/src/rolling-plan-contracts.ts`
- `packages/microdrama/src/rolling-plan-constraints.ts`
- `packages/microdrama/src/rolling-plan-planner.ts`
- `packages/microdrama/src/rolling-plan-workflow.ts`
- `packages/microdrama/src/rolling-plan.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run packages/microdrama/src/rolling-plan.unit.test.ts` — 5 passed
- `pnpm --filter @mediaforge/microdrama typecheck` — pass

## External calls

None.

## Backlog

- MICRO-006 → DONE
- MICRO-044 → unblocked dependency path (still blocked on MICRO-008)

## Checkpoint

Pending commit.
