# Task 03: Workflow Manifest Store

## 1. Role And Context

You are adding durable workflow state without implementing provider stages.

## 2. Required Repository Instructions

Read root `AGENTS.md` and story-localization guardrails. Use atomic writes and focused tests.

## 3. Objective

Implement a JSON workflow manifest store with schema validation, atomic writes, file locking, corruption recovery, and append/update helpers for stage attempts.

## 4. Prerequisite Tasks

Task 02.

## 5. Authoritative Planning References

- Master plan "Persistence".
- Schema design "Serialization" and "Versioning And Migration".

## 6. Architectural Invariants

Filesystem manifest is source of truth initially; SQLite is not required for this task.

## 7. Exact Scope

Create store module and tests only.

## 8. Likely Files And Symbols

- `packages/story-localization/src/story-workflow-store.ts`.
- Existing helpers: `writeJsonAtomic`, `readJsonIfExists`, `withFileLock`.

## 9. Required Implementation Behavior

Create, load, save, mutate with lock, quarantine corrupt manifest, reject incompatible schema version.

## 10. Required Types

Use `WorkflowManifest`, `StageOutcome`, `StageId`, `WorkflowId`, `ExecutionId`.

## 11. Required State Transitions

Allow adding attempts and updating current stage status according to schema.

## 12. Required Failure And Fallback Behavior

Persistence failure surfaces as `persistence-failed`; corrupt manifest as `cache-corrupt` or `manifest-version-incompatible`.

## 13. Persistence Requirements

Path: `episodes/<episode>/state/story-workflow/workflows/<workflowId>.json`.

## 14. Observability Requirements

Store writes update timestamps and preserve execution IDs.

## 15. Backward-Compatibility Requirements

Do not alter existing `.localization-cache` or `.batch`.

## 16. Tests And Fixtures

Create/load/update, concurrent lock, corrupt JSON quarantine, incompatible version.

## 17. Explicit Non-Goals

No scheduling or provider calls.

## 18. Parallelization Constraints

Blocks most workflow implementation.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-store.unit.test.ts
```

## 20. Acceptance Criteria

Manifest state is durable, validated, locked, and recoverable.

## 21. Requested Commit Message

`feat(workflow): persist story workflow manifests`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
