# Task 05: Refactor CLI, Workers, And API Entry Points

## Objective

Ensure every public runtime entry point uses active application use cases.

## Background

`apps/api` currently boots `@mediaforge/pipeline`. Root CLI commands also preserve legacy flow.

## Scope

Refactor `apps/api`, active CLI command handlers, and any future worker hooks found during implementation.

## Expected files

- `apps/api/src/index.ts`
- `apps/api/package.json`
- `apps/cli/src/index.ts`
- CLI command unit tests

## Procedure

1. Replace API `createPipeline()` boot with config/application health.
2. Route active CLI handlers through use cases.
3. Mark old root commands as removed or transitional aliases only if approved.
4. Keep `--episode`, `--language`, `--variant` explicit.

## Safety constraints

Do not remove public commands before release-note decision.

## Validation

```bash
pnpm --filter @mediaforge/api typecheck
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

## Completion checklist

- [ ] API has no pipeline import
- [ ] active CLI has resolver-backed args
- [ ] public removals documented

## Dependencies

Task 04.

## Batching

API refactor can batch with dependency cleanup only after imports are gone.
