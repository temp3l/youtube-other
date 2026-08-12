# MICRO-012 scene and shot compiler

Date: 2026-08-12
Task: MICRO-012
Status: DONE

## Goal

Derive language-neutral semantic scene and shot plans from accepted V5 beat plans with registry references, reactions, continuity, and canary asset-density policy.

## Files changed

- `packages/scene-planning/src/microdrama-semantic-ids.ts`
- `packages/scene-planning/src/index.ts`
- `packages/visual-planning/src/microdrama-canary-asset-density.ts`
- `packages/visual-planning/src/index.ts`
- `packages/microdrama/package.json`
- `packages/microdrama/src/v5-scene-shot-compiler-contracts.ts`
- `packages/microdrama/src/v5-scene-shot-compiler.ts`
- `packages/microdrama/src/v5-scene-shot-compiler.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/microdrama/src/v5-scene-shot-compiler.unit.test.ts` — 2 passed

## External calls

None.

## Backlog

- MICRO-012 → DONE
- MICRO-013, MICRO-014 → READY

## Risks

- Worktree validation requires local V5 episode markdown (not tracked in git); CI/main repo already has them.
- Visual registry references use seed revision IDs until MICRO-013 binds approved assets.
