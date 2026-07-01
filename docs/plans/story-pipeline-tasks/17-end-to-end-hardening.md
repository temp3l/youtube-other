# Task 17: End-To-End Hardening

## 1. Role And Context

You are proving the workflow satisfies the acceptance criteria.

## 2. Required Repository Instructions

Use mocked providers and targeted e2e/integration tests. Do not regenerate broad fixtures automatically.

## 3. Objective

Add end-to-end and integration coverage for complete success, fallback, partial failure, resume, invalidation, batch, and `sp` prevention.

## 4. Prerequisite Tasks

Task 16.

## 5. Authoritative Planning References

- `story-pipeline-test-strategy.md`.
- Master plan "Acceptance Criteria".

## 6. Architectural Invariants

Tests must not weaken assertions or require paid APIs.

## 7. Exact Scope

Tests, fixtures, and small bug fixes only.

## 8. Likely Files And Symbols

- `packages/story-localization/src/story-workflow.integration.test.ts`.
- `packages/story-localization/src/story-workflow.e2e.test.ts`.
- `apps/cli/src/story-pipeline-command.integration.test.ts`.

## 9. Required Implementation Behavior

Exercise full workflow through public adapters/CLI where feasible.

## 10. Required Types

Use public workflow manifest/report schemas.

## 11. Required State Transitions

Assert success, partial success, blocked, skipped dependency-blocked, cached/resumed.

## 12. Required Failure And Fallback Behavior

Cover English fallback accepted/rejected, localized fallback accepted/rejected, provider vs quality failure distinction.

## 13. Persistence Requirements

Temp workspaces must inspect manifests and artifact refs.

## 14. Observability Requirements

Assert status/inspect JSON exposes costs, warnings, provider batch IDs, and failures.

## 15. Backward-Compatibility Requirements

Legacy command delegation tested.

## 16. Tests And Fixtures

Use the ten e2e scenarios from `story-pipeline-test-strategy.md`.

## 17. Explicit Non-Goals

No broad snapshot regeneration.

## 18. Parallelization Constraints

Final hardening task.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow.integration.test.ts
pnpm test:focused -- apps/cli/src/story-pipeline-command.integration.test.ts
```

## 20. Acceptance Criteria

All user-requested workflow acceptance criteria are verified or explicitly documented as future work.

## 21. Requested Commit Message

`test(workflow): harden story pipeline end to end`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
