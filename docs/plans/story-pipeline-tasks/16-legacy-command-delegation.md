# Task 16: Legacy Command Delegation

## 1. Role And Context

You are migrating command surfaces without breaking operators.

## 2. Required Repository Instructions

Be conservative. Do not remove commands.

## 3. Objective

Delegate stable legacy story commands to the unified workflow where parity is proven, while preserving flags, outputs, and exit behavior.

## 4. Prerequisite Tasks

Tasks 14 and 15.

## 5. Authoritative Planning References

- Master plan "Migration Path" and "Deprecation Inventory".
- `story-pipeline-deprecation-inventory.md`.

## 6. Architectural Invariants

No legacy command removal in this task.

## 7. Exact Scope

Command delegation and compatibility tests.

## 8. Likely Files And Symbols

- `story-full-rewrite-command.ts`.
- `story-short-rewrite-command.ts`.
- `story-analysis-command.ts`.
- `story-localization-commands.ts`.

## 9. Required Implementation Behavior

Delegate when workflow mode is enabled or safe by default; otherwise preserve old path. Add advisory warnings only if approved by tests.

## 10. Required Types

Use workflow command adapters.

## 11. Required State Transitions

Legacy command creates/resumes workflow stages matching requested behavior.

## 12. Required Failure And Fallback Behavior

Legacy rewrite-full gains English fallback only through workflow path.

## 13. Persistence Requirements

Workflow manifests are written for delegated commands.

## 14. Observability Requirements

Legacy JSON includes workflowId/executionId additively if safe.

## 15. Backward-Compatibility Requirements

Existing tests must pass or be intentionally updated with compatibility notes.

## 16. Tests And Fixtures

Existing CLI tests plus delegation-specific tests for output compatibility, failure exit codes, and `sp` rejection.

## 17. Explicit Non-Goals

No deletion of mixed schemas or old services.

## 18. Parallelization Constraints

Architecture-sensitive; avoid parallel edits to CLI command files.

## 19. Commands To Run

```bash
pnpm test:focused -- apps/cli/src/story-full-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-short-rewrite-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-analysis-command.unit.test.ts
pnpm test:focused -- apps/cli/src/story-localization-commands.unit.test.ts
```

## 20. Acceptance Criteria

Legacy commands remain compatible and can delegate to workflow safely.

## 21. Requested Commit Message

`feat(cli): delegate story commands to workflow`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 High, high reasoning.
