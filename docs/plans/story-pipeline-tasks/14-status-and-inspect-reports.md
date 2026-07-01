# Task 14: Status And Inspect Reports

## 1. Role And Context

You are exposing partial success to operators.

## 2. Required Repository Instructions

Follow CLI output conventions; keep tests focused.

## 3. Objective

Implement human-readable and JSON workflow status/inspect reports.

## 4. Prerequisite Tasks

Tasks 04, 11, 12, and 13.

## 5. Authoritative Planning References

- Master plan "Observability".
- Final report example in user request.

## 6. Architectural Invariants

Reports must make partial success explicit.

## 7. Exact Scope

Formatting/report builders and CLI wiring.

## 8. Likely Files And Symbols

- `apps/cli/src/story-pipeline-command.ts`.
- New `story-pipeline-status-output.ts`.

## 9. Required Implementation Behavior

Show per locale/format quality, fallback, audio, metadata, image, render, publish states and workflow result.

## 10. Required Types

Report schema from workflow contracts.

## 11. Required State Transitions

No state mutation except optional inspect access timestamp if already designed.

## 12. Required Failure And Fallback Behavior

Display original failure and fallback provenance separately.

## 13. Persistence Requirements

Read workflow manifest only.

## 14. Observability Requirements

JSON includes all structured stage fields required by master plan.

## 15. Backward-Compatibility Requirements

Do not alter `stories status` existing behavior unless workflow manifest path is explicit.

## 16. Tests And Fixtures

Full success, partial locale failure, source fallback, audio failure, batch partial, JSON schema.

## 17. Explicit Non-Goals

No scheduling or generation.

## 18. Parallelization Constraints

After media/batch/cost fields stabilize.

## 19. Commands To Run

```bash
pnpm test:focused -- apps/cli/src/story-pipeline-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-pipeline-status-output.unit.test.ts
```

## 20. Acceptance Criteria

Operators can see exactly what succeeded, failed, was blocked, reused, or fell back.

## 21. Requested Commit Message

`feat(cli): report story pipeline partial success`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.4 Medium, medium reasoning.
