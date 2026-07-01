# Task 02: Workflow Schema Contracts

## 1. Role And Context

You are adding planning-backed TypeScript contracts for a future durable story workflow.

## 2. Required Repository Instructions

Read root `AGENTS.md`. Use code as authoritative. Keep this task schema-only.

## 3. Objective

Create strict workflow domain schemas and types for IDs, stage outcomes, failures, warnings, quality decisions, lineage, cost, cache metadata, fingerprint inputs, and workflow manifests.

## 4. Prerequisite Tasks

Task 01.

## 5. Authoritative Planning References

- `story-pipeline-schema-design.md`.
- Master plan sections "Typed Domain Model", "Failure Taxonomy", "Persistence".

## 6. Architectural Invariants

Use discriminated unions. Avoid ambiguous booleans, arbitrary strings, nullable domain fields, and untyped JSON.

## 7. Exact Scope

Add schemas/types and unit tests. Do not wire orchestration.

## 8. Likely Files And Symbols

- New package or module: `packages/story-localization/src/story-workflow.types.ts`, `story-workflow.schemas.ts`, or new `packages/workflow`.
- `packages/story-localization/src/index.ts` only if exports are needed.

## 9. Required Implementation Behavior

Schemas parse valid examples and reject invalid locale, `sp`, unknown failure category, missing lineage, and malformed IDs.

## 10. Required Types

Define all required types listed in schema design, including `StageOutcome<T>`, `StageFailure`, `QualityGateDecision`, `WorkflowManifest`, `BatchSubmission`, and `BatchItemState`.

## 11. Required State Transitions

Represent planned, running, succeeded, cached, failed, blocked, skipped, cancelled.

## 12. Required Failure And Fallback Behavior

Encode fallback categories and provenance values; do not implement fallback logic.

## 13. Persistence Requirements

Schemas must be serializable stable JSON.

## 14. Observability Requirements

Stage outcome schema includes required observability fields from master plan.

## 15. Backward-Compatibility Requirements

Do not change existing artifact schemas.

## 16. Tests And Fixtures

Unit tests for manifest, outcome, failure, quality decision, locale, and JSON round trip.

## 17. Explicit Non-Goals

No CLI, no provider calls, no existing service rewrites.

## 18. Parallelization Constraints

Blocks manifest store and CLI skeleton.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow.schemas.unit.test.ts
```

## 20. Acceptance Criteria

All required contracts exist with runtime validation and reject `sp`.

## 21. Requested Commit Message

`feat(workflow): add story workflow schemas`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.4 Medium, medium reasoning.
