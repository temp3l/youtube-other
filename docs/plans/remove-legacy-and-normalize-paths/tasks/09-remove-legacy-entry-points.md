# Task 09: Remove Legacy Entry Points

## Objective

Remove obsolete runtime access to the old pipeline.

## Background

Root CLI commands and API boot keep `@mediaforge/pipeline` alive.

## Scope

Remove or replace `create`, `run`, `status`, `inspect`, `retry`, `clean`, and API pipeline boot after approved public-contract decision.

## Expected files

- `apps/cli/src/index.ts`
- `apps/api/src/index.ts`
- command tests
- docs/CLI references

## Procedure

1. Confirm public-removal approval.
2. Remove command registration and handlers.
3. Replace API health with active app/config health.
4. Update tests to assert absence or replacement.

## Safety constraints

No low-level bypass replacement.

## Validation

```bash
pnpm test:focused -- apps/cli/src/index.unit.test.ts
pnpm --filter @mediaforge/api typecheck
```

## Completion checklist

- [ ] legacy commands absent or approved aliases
- [ ] API no longer imports pipeline
- [ ] docs updated

## Dependencies

Tasks 04 and 05.

## Batching

Can batch API and CLI only if release decision is complete.
