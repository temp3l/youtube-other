# Task 12: Simplify Shared Abstractions

## Objective

Collapse abstractions that only existed to support coexistence.

## Background

Shared helpers still expose legacy generated images, legacy Spanish locale checks, legacy response schemas, and compatibility paths.

## Scope

Remove compatibility abstractions after all active consumers migrate.

## Expected files

- `packages/shared/src/episode-filesystem.ts`
- `packages/story-localization/src/*legacy*`
- `packages/domain/src/*`
- tests

## Procedure

1. Run stale search.
2. Remove unused legacy helpers.
3. Rename generic interfaces to Dark Truth-specific names only where helpful.
4. Keep validation for rejecting legacy inputs such as `sp`.

## Safety constraints

Do not remove validation that protects against legacy bad input.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
rg "legacyGenerated|legacy-mixed|story-workflow-legacy" packages apps
```

## Completion checklist

- [ ] empty compatibility layers gone
- [ ] active abstractions simpler
- [ ] stale refs classified

## Dependencies

Tasks 10 and 11.

## Batching

Can batch small helper removals after import search is clean.
