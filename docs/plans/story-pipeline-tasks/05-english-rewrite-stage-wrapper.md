# Task 05: English Rewrite Stage Wrapper

## 1. Role And Context

You are wrapping existing English full rewrite behavior as a workflow stage.

## 2. Required Repository Instructions

Read story-localization instructions. Mock provider calls.

## 3. Objective

Create a stage adapter that invokes existing canonical English full rewrite behavior, records generated artifacts, validation status, fingerprints, usage, and typed failures.

## 4. Prerequisite Tasks

Task 03.

## 5. Authoritative Planning References

- Master plan "English Rewrite Fallback" normal path.
- Repository map row for `story-localization.service.ts`.

## 6. Architectural Invariants

Do not rewrite prompt/compiler/generation internals. Provider failure is not quality failure.

## 7. Exact Scope

Stage wrapper and tests; no fallback yet.

## 8. Likely Files And Symbols

- `packages/story-localization/src/story-workflow-english.ts`.
- Existing `localizeStoryEpisode`, canonical persistence helpers.

## 9. Required Implementation Behavior

Attempt rewrite, map success to `rewrite-full:en` succeeded, map provider/schema/preflight failures to typed `StageFailure`.

## 10. Required Types

`StageOutcome`, `ArtifactLineage`, `CostMetrics`, `FailureCategory`.

## 11. Required State Transitions

planned -> running -> succeeded/failed.

## 12. Required Failure And Fallback Behavior

Persist failure only; Task 06 performs fallback.

## 13. Persistence Requirements

Update workflow manifest atomically after attempt.

## 14. Observability Requirements

Record provider/model/reasoning/request IDs where available.

## 15. Backward-Compatibility Requirements

Existing `stories rewrite-full` behavior remains unchanged.

## 16. Tests And Fixtures

Mock success, provider failure, schema failure, local validation failure.

## 17. Explicit Non-Goals

No localized branches, no quality gate implementation beyond recording existing validation.

## 18. Parallelization Constraints

Precedes source fallback.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-english.unit.test.ts
```

## 20. Acceptance Criteria

English rewrite stage records success/failure without changing production code paths.

## 21. Requested Commit Message

`feat(workflow): wrap canonical English rewrite stage`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
