# Task 15: Resume And Invalidation

## 1. Role And Context

You are making workflow reruns deterministic and granular.

## 2. Required Repository Instructions

Use existing cache/resume docs and focused tests.

## 3. Objective

Implement dependency-aware resume and invalidation using the matrix in the planning docs.

## 4. Prerequisite Tasks

Tasks 03, 11, and 13.

## 5. Authoritative Planning References

- `story-pipeline-cache-invalidation-matrix.md`.
- Existing Task 16 plan.

## 6. Architectural Invariants

Avoid global invalidation for locale-only changes.

## 7. Exact Scope

Workflow invalidation engine and tests.

## 8. Likely Files And Symbols

- workflow invalidation module.
- `story-localization-cache.ts` adapters.
- package manifest readers as needed.

## 9. Required Implementation Behavior

Recompute fingerprints, mark stale stages, reuse current artifacts, block incompatible manifests.

## 10. Required Types

`FingerprintInputs`, `CacheMetadata`, invalidation reasons.

## 11. Required State Transitions

current -> cache-reused/resumed or stale -> planned.

## 12. Required Failure And Fallback Behavior

Cache corrupt bypasses cache; manifest incompatible blocks resume until migration.

## 13. Persistence Requirements

Persist invalidation decisions and resume events.

## 14. Observability Requirements

Report reused artifacts and invalidation reasons.

## 15. Backward-Compatibility Requirements

Legacy artifacts without lineage are not fresh cache hits.

## 16. Tests And Fixtures

English source change; German voice change; Spanish metadata prompt change; visual style change; stale short parent; legacy compatibility markdown rejection.

## 17. Explicit Non-Goals

No provider calls.

## 18. Parallelization Constraints

Coordinate with status task for output fields.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-invalidation.unit.test.ts
```

## 20. Acceptance Criteria

Resume is idempotent and invalidation is granular.

## 21. Requested Commit Message

`feat(workflow): add granular resume invalidation`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
