# Batch 7 Fingerprints, Cache, and Invalidation

Commit: `2197009156ed909d8a4e61757ef7554bcab49770` (changes uncommitted).

## Summary

Implemented canonical normalized fingerprints, manifest- and artifact-verified
cache decisions, append-only decision evidence, known-version subsystem cache
adapters, dependency-aware invalidation, cache inspection/miss explanation, and
safe prune planning. Batch 8 is unblocked. No provider or publishing operation
ran.

## Changed files

- `packages/workflow-engine/src/{cache,task-registry,workflow-store,workflow-operator,index}*`
- `apps/cli/src/workflow-commands*`
- Batch status, audit status, AI context, and this report

## Tests/checks and results

- Focused cache/operator/CLI Vitest: 3 files, 38 passed.
- Workflow-engine typecheck and build: passed.
- Targeted ESLint, Prettier, and diff checks: passed.

## Risks and follow-up

Production cache callers remain on versioned compatibility paths until their
scheduled family migrations. Prune intentionally never deletes canonical
attempt history; legacy deletion requires an explicit future adapter action.
