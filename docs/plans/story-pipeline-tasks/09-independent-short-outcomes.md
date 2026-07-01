# Task 09: Independent Short Outcomes

## 1. Role And Context

You are integrating short generation as independent locale/format stages.

## 2. Required Repository Instructions

Use focused short rewrite tests; no provider calls.

## 3. Objective

Represent and execute short generation/validation/quality independently from full story acceptance.

## 4. Prerequisite Tasks

Task 07.

## 5. Authoritative Planning References

- Master plan "Full And Short Independence".
- Existing Tasks 09 and 10 plans.

## 6. Architectural Invariants

Accepted full is a dependency, not proof that short is valid.

## 7. Exact Scope

Workflow adapter around existing `rewriteShortStories` plus quality decision linkage.

## 8. Likely Files And Symbols

- `short-rewrite.service.ts`.
- `short-rewrite.types.ts`.
- `story-workflow-shorts.ts`.

## 9. Required Implementation Behavior

Skip short when matching full is not accepted; generate short when full accepted; persist generation failed, validation failed, quality blocked, or accepted.

## 10. Required Types

`FormatWorkflowResult`, short failure categories.

## 11. Required State Transitions

full accepted -> short planned/running -> accepted/blocked/failed.

## 12. Required Failure And Fallback Behavior

No automatic fallback from short to full. Repair/regeneration only through existing short routing.

## 13. Persistence Requirements

Link short artifact to parent full artifact fingerprint and quality artifact.

## 14. Observability Requirements

Expose short status independently in reports.

## 15. Backward-Compatibility Requirements

Keep existing short output paths.

## 16. Tests And Fixtures

Full blocked skips short; full accepted short accepted; full accepted short generation failed; full accepted short quality blocked.

## 17. Explicit Non-Goals

No localized full fallback.

## 18. Parallelization Constraints

Parallel with Task 08 if workflow result type coordination is stable.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/short-rewrite.service.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-workflow-shorts.unit.test.ts
```

## 20. Acceptance Criteria

Short outcomes are independent and dependency-blocked correctly.

## 21. Requested Commit Message

`feat(workflow): model independent short outcomes`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
