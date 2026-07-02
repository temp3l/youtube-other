# Task 13: Remove Legacy API, Events, And Queues

## Objective

Clean any public API, event, queue, or workflow contracts tied only to legacy.

## Background

No runtime queue framework was found, but final implementation must verify stale identifiers.

## Scope

API routes, event names, queue names, workflow manifests, and docs.

## Expected files

- `apps/api/**`
- `packages/story-localization/src/story-workflow-*`
- docs and config references

## Procedure

1. Search queue/event/workflow identifiers in all case styles.
2. Remove legacy API contracts after consumer review.
3. Preserve active story workflow manifests unless replaced.

## Safety constraints

Mark uncertain external contracts instead of deleting blindly.

## Validation

```bash
rg "queue|event|workflow|createPipeline|pipeline_run|step_runs" apps packages docs
pnpm --filter @mediaforge/api typecheck
```

## Completion checklist

- [ ] no legacy API route/import
- [ ] no legacy queue/event names unexplained
- [ ] workflow refs classified

## Dependencies

Task 09.

## Batching

Can batch with docs cleanup.
