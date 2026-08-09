# VRI-13 canonical Veronica workflow orchestration

Date: 2026-08-09

## Changed files

- `packages/strategic-reinvention/src/full-task-definitions.ts`
- `packages/strategic-reinvention/src/task-registry.ts`
- `packages/strategic-reinvention/src/workflow-operator.ts`
- `packages/strategic-reinvention/src/workflow.integration.test.ts`
- `packages/strategic-reinvention/src/workflow-operator.unit.test.ts`
- `apps/cli/src/workflow-commands.ts`

## Changes

Workflow registrations and persisted workflow definitions now use the canonical
`veronicabenini` profile id. The CLI defaults strategic episodes to Italian.
The former implementation that ran the complete fixture-producing episode
pipeline for every task invocation was removed. Non-approval stages are now
explicitly registered, fail-closed bindings with typed injection points for
owning capabilities, artifact contracts, fingerprints, approvals, and canonical
repository verification. They preserve workflow identity and the shared
engine's earliest-stale cache selection without creating fixtures or enabling providers.
The supplemental operator now creates its actual sub-workflow rather than the
full workflow.

## Checks

- `pnpm --filter @mediaforge/workflow-engine build` — passed, enabling the isolated operator contract.
- `pnpm test:focused -- packages/strategic-reinvention/src/workflow-operator.unit.test.ts` — 2 passed.
- `pnpm test:focused -- packages/strategic-reinvention/src/workflow.integration.test.ts` — blocked at collection by unbuilt workspace package entries on the legacy supplemental-media path.
- `pnpm --filter @mediaforge/strategic-reinvention exec tsc --noEmit -p tsconfig.json` — no VRI-13 errors; remains blocked by unresolved YouTube-upload entries and existing Veronica readonly errors.
- `git diff --check` — passed.

## Risks and follow-up

Owning capabilities must inject verified revision-bound implementations before
the corresponding stage can execute. No provider activation is enabled.
