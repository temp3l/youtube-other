# Task 11: Remove Legacy Generation Components

## Objective

Remove legacy generation helpers that bypass active orchestration.

## Background

Direct raw image, monolithic audio, legacy transcript, and compatibility generation paths overlap active services.

## Scope

Remove only helpers proven unused by Dark Truth.

## Expected files

- `apps/cli/src/index.ts`
- `packages/image-generation/src/openai-image.ts` if unused
- legacy audio/transcript helper code
- tests and docs

## Procedure

1. Classify each helper as active, test-only, legacy-only, or uncertain.
2. Replace active usage with application use cases.
3. Remove legacy-only code and tests.

## Safety constraints

Keep sync/batch image strategies and remote rendering if active.

## Validation

```bash
rg "generate-openai|original-transcript|audio/script-source|legacyGenerated" apps packages
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

## Completion checklist

- [ ] no unsupported direct provider shortcuts
- [ ] legacy audio path removed
- [ ] active image/render paths preserved

## Dependencies

Tasks 04, 06, and 09.

## Batching

Split by media owner.
