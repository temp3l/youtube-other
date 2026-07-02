# Task 17: Update Tests And Fixtures

## Objective

Remove obsolete tests and update fixtures to canonical paths.

## Background

Many tests assert root `script.md`, `<lang>/full/script.md`, and legacy compatibility behavior.

## Scope

Tests and fixtures only.

## Expected files

- `apps/**/src/**/*.test.ts`
- `packages/**/src/**/*.test.ts`
- fixture directories under test-owned paths

## Procedure

1. Classify tests as Dark Truth protection, legacy-only, shared behavior, layout assumption, migration coverage, obsolete, or uncertain.
2. Update active tests to use resolver.
3. Delete legacy-only tests after code removal.
4. Prefer semantic assertions over snapshots.

## Safety constraints

Do not weaken assertions to make migration pass.

## Validation

```bash
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

## Completion checklist

- [ ] no stale fixture paths
- [ ] legacy-only tests removed
- [ ] migration coverage remains

## Dependencies

Tasks 03 through 16 as applicable.

## Batching

Update fixtures with owning code changes.
