# Task 09: Canonical Workflow Integration

## Objective

Register a real resumable Strategic Reinvention DAG in the canonical workflow engine and expose it through existing operator surfaces.

## Dependencies And Parallelism

Depends on Tasks 05, 06, 07, and 08. Sequential integration task.

## Exclusive Ownership

- `packages/strategic-reinvention/src/task-registry.ts`, integration tests, and exports
- strategic composition changes in `apps/cli/src/workflow-commands.ts`
- assigned registration changes in `apps/cli/src/index.ts`
- only the minimal application composition changes required for canonical dispatch

## Required Behavior

- Register the target DAG with real artifact contracts/fingerprints, not synthetic placeholders.
- Use workflow approval policies for every manual gate.
- Resume valid outputs without duplication and persist invalidation reasons/events.
- Make full render depend on approved visual, audio, captions, and metadata inputs.
- Keep the old stories planner characterization-only; do not create a second strategic store.
- Derive genre/creator identity from the persisted blueprint.

## Verification

```bash
pnpm test:focused -- packages/strategic-reinvention/src/workflow.integration.test.ts
pnpm test:focused -- apps/cli/src/workflow-commands.unit.test.ts
```

## Acceptance

Plan/status/next/run/resume/reconcile use one task registry and state authority; interruption resumes deterministically; source changes invalidate every downstream node; no compatibility command becomes a second writer.

Lead checkpoint: `feat(workflow): register strategic reinvention pipeline`.
