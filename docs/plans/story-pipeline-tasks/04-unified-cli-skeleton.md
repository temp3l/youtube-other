# Task 04: Unified CLI Skeleton

## 1. Role And Context

You are adding the operator entry point for the workflow without running production stages.

## 2. Required Repository Instructions

Use `apps/cli` conventions and focused CLI tests.

## 3. Objective

Add `stories pipeline` with options for episode, locales, formats, resume, dry-run, cost estimate, batch mode, JSON, and verbosity. Dry-run writes/prints a planned graph using the manifest store.

## 4. Prerequisite Tasks

Tasks 02 and 03.

## 5. Authoritative Planning References

- Master plan "CLI".
- Roadmap task 04.

## 6. Architectural Invariants

Command lives under `stories`, not a new root command. Existing commands remain unchanged.

## 7. Exact Scope

CLI registration and dry-run only.

## 8. Likely Files And Symbols

- `apps/cli/src/story-pipeline-command.ts`.
- `apps/cli/src/story-localization-commands.ts`.
- `apps/cli/src/story-pipeline-command.unit.test.ts`.

## 9. Required Implementation Behavior

Parse canonical locales/formats, reject `sp`, create or load dry-run manifest, output human/JSON summary.

## 10. Required Types

Use workflow schema types from Task 02.

## 11. Required State Transitions

Dry-run stages remain `planned`.

## 12. Required Failure And Fallback Behavior

No actual fallback execution; graph must include fallback-capable stage branches.

## 13. Persistence Requirements

Dry-run may write a manifest only if design chooses; if not, output must still validate against schemas.

## 14. Observability Requirements

JSON includes workflowId, executionId, episodeId, locales, formats, planned stage count.

## 15. Backward-Compatibility Requirements

No existing command flags change.

## 16. Tests And Fixtures

Command registration, option parsing, `sp` rejection, JSON output, dry-run graph.

## 17. Explicit Non-Goals

No providers, no story generation, no media work.

## 18. Parallelization Constraints

Can proceed before stage adapters.

## 19. Commands To Run

```bash
pnpm test:focused -- apps/cli/src/story-pipeline-command.unit.test.ts
```

## 20. Acceptance Criteria

`stories pipeline --dry-run --json` returns a valid planned workflow.

## 21. Requested Commit Message

`feat(cli): add story pipeline dry-run command`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.4 Medium, medium reasoning.
