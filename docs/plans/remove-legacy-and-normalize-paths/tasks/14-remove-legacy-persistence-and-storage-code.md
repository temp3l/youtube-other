# Task 14: Remove Legacy Persistence And Storage Code

## Objective

Remove legacy-only persistence code without deleting production data.

## Background

SQLite `episodes`, `pipeline_runs`, and `step_runs` mainly support the old pipeline.

## Scope

Code and schema references only. Data deletion requires separate operational approval.

## Expected files

- `packages/persistence/src/index.ts`
- config/docs/tests

## Procedure

1. Confirm no active use case writes pipeline runs or step runs.
2. Remove or narrow persistence exports.
3. Document manual DB archival/drop procedure separately if approved.

## Safety constraints

No automatic migration or table drop in this task.

## Validation

```bash
rg "pipeline_runs|step_runs|saveStepRun|savePipelineRun" apps packages
pnpm --filter @mediaforge/persistence typecheck
```

## Completion checklist

- [ ] legacy DB code unused or removed
- [ ] destructive DB cleanup documented as manual
- [ ] active manifests unaffected

## Dependencies

Task 10.

## Batching

Keep isolated.
