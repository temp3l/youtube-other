# MICRO-013 shared visual generation and cache identity

Date: 2026-08-12
Task: MICRO-013
Status: DONE

## Goal

Bind image generation to approved semantic shots and reusable visual keys with provider-neutral adapters, shared cache identity, and dependency invalidation.

## Files changed

- `packages/visual-planning/src/microdrama-source-plate-prompt.ts`
- `packages/visual-planning/src/index.ts`
- `packages/image-generation/src/microdrama-visual-generation/*`
- `packages/image-generation/src/microdrama-visual-generation.unit.test.ts`
- `packages/image-generation/src/index.ts`
- `packages/image-generation/package.json`
- `packages/workflow-engine/src/microdrama-visual-generation.ts`
- `packages/workflow-engine/src/microdrama-visual-generation.unit.test.ts`
- `packages/workflow-engine/src/index.ts`
- `packages/microdrama/src/v5-visual-generation.ts`
- `packages/microdrama/src/v5-visual-generation.unit.test.ts`
- `packages/microdrama/src/index.ts`
- `packages/microdrama/package.json`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm exec vitest run -c vitest.unit.config.ts packages/image-generation/src/microdrama-visual-generation.unit.test.ts` — 4 passed
- `pnpm test:focused -- packages/workflow-engine/src/microdrama-visual-generation.unit.test.ts` — 2 passed
- `pnpm exec vitest run -c vitest.unit.config.ts packages/microdrama/src/v5-visual-generation.unit.test.ts` — 1 passed

## External calls

None.

## Backlog

- MICRO-013 → DONE
- MICRO-018, MICRO-047 remain BLOCKED on MICRO-016/MICRO-017 and other dependencies

## Risks

- `dark-truth` profile id used for artifact identity until a dedicated microdrama content profile exists.

## Checkpoint

`9e03591`
