# VRI-04 artifact cache invalidation

- Date: 2026-08-09
- Source plan: `docs/plans/veronicabenini-strategic-reinvention-implementation/tasks/vri-04-shared-artifact-identity-cache-and-typed-invalidation.md`

## Summary

Added versioned semantic artifact identity and typed dependency invalidation. Fingerprints canonicalize the Veronica alias and can omit locale for language-independent visuals. Prompt cache keys now support shared visual keys across locales. Workflow invalidation records targeted reasons while preserving artifact files and approvals as immutable evidence.

## Changed files

- `packages/workflow-engine/src/cache.ts`
- `packages/workflow-engine/src/cache.unit.test.ts`
- `packages/workflow-engine/src/workflow-store.ts`
- `packages/shared/src/prompt-cache.ts`
- `packages/shared/src/prompt-cache.unit.test.ts`

## Checks

- `pnpm test:focused -- packages/workflow-engine/src/cache.unit.test.ts packages/shared/src/prompt-cache.unit.test.ts` — passed (36 tests).
- `pnpm test:focused -- packages/workflow-engine/src/workflow-store.unit.test.ts` — passed (14 tests), including duplicate-target task invalidation.
- `pnpm --filter @mediaforge/shared typecheck` — passed after the VRI-01 shared adapter follow-up.
- `git diff --check` — passed.

## Risks and follow-up

No persistence or API activation was added. Workflow-engine package typecheck remains deferred until its broader dependency build chain is available.
