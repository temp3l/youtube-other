# Batch 4 Task Registry and DAG

Commit: `2197009156ed909d8a4e61757ef7554bcab49770` (changes uncommitted).

## Summary

Implemented the additive canonical task registry, profile DAG validation,
readiness, list/explain APIs, deterministic dry-run planning, and legacy-service
adapter boundary. Added complete Dark Truth and mathematics registrations with
one declared capability owner per logical task. Batch 5 is unblocked; no
production callers were migrated.

## Changed paths

- `packages/workflow-engine/src/task-registry*`, `src/index.ts`
- `packages/dark-truth/{package.json,src/index.ts,src/task-registry*}`
- `packages/math-education/{package.json,src/index.ts,src/task-registry*}`
- `pnpm-lock.yaml`, Batch status, audit status, and AI context

## Tests/checks

- Registry Vitest: 9 passed.
- Profile DAG Vitest: 2 passed.
- Workflow-engine, Dark Truth, and math-education typechecks: passed.
- Targeted ESLint, Prettier, and diff checks: passed.

## Unresolved risks

Implementations remain optional bindings until caller migration; durable state,
events, locks, and reconciliation belong to Batch 5.
