# MICRO-010 visual asset registry

Date: 2026-08-12
Task: MICRO-010
Status: DONE

## Goal

Persist approved character, appearance, location, prop and reference identities with hash-addressed references and continuity lookup.

## Files changed

- `packages/domain/src/visual-asset-registry-contracts.ts`
- `packages/domain/src/visual-asset-registry-contracts.unit.test.ts`
- `packages/domain/src/index.ts`
- `packages/persistence/src/visual-asset-registry-port.ts`
- `packages/persistence/src/visual-asset-registry-schema.ts`
- `packages/persistence/src/visual-asset-registry-repository.ts`
- `packages/persistence/src/visual-asset-registry-repository.integration.test.ts`
- `packages/persistence/src/index.ts`
- `packages/image-generation/src/visual-asset-continuity.ts`
- `packages/image-generation/src/visual-asset-continuity.unit.test.ts`
- `packages/image-generation/src/index.ts`
- `vitest.integration.config.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/image-generation/src/visual-asset-continuity.unit.test.ts` — 4 passed
- `pnpm test:focused -- packages/persistence/src/visual-asset-registry-repository.integration.test.ts -t "stores revisions"` — pass (6 tests in file)

## External calls

None.

## Backlog

- MICRO-010 → DONE

## Checkpoint

`6697876`
