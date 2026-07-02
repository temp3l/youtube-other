# Task 10: Remove Legacy Orchestration

## Objective

Delete old end-to-end orchestration after active use cases own behavior.

## Background

`@mediaforge/pipeline` duplicates story/audio/image/render sequencing.

## Scope

Remove pipeline package internals and imports.

## Expected files

- `packages/pipeline/**`
- `apps/cli/package.json`
- `apps/api/package.json`
- root/package references

## Procedure

1. Verify `rg "@mediaforge/pipeline|createPipeline"` returns only planned removals.
2. Delete package source/tests.
3. Remove workspace dependencies.
4. Update lockfile.

## Safety constraints

Do not remove shared packages used by active flows.

## Validation

```bash
rg "@mediaforge/pipeline|createPipeline" apps packages scripts
pnpm --filter @mediaforge/cli typecheck
pnpm --filter @mediaforge/api typecheck
```

## Completion checklist

- [ ] no internal pipeline imports
- [ ] package dependency removed
- [ ] lockfile updated

## Dependencies

Task 09.

## Batching

Can batch with Task 16 after imports are gone.
