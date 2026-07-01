# Task 06: English Source Fallback Flow

## 1. Role And Context

You are implementing the critical English rewrite fallback behavior.

## 2. Required Repository Instructions

No paid provider calls. Use focused tests and fake quality clients.

## 3. Objective

When English rewrite fails due to generation/infrastructure failure, validate and quality-gate the original source as canonical fallback.

## 4. Prerequisite Tasks

Task 05.

## 5. Authoritative Planning References

- Master plan "English Rewrite Fallback".
- Schema design "Failure Taxonomy Contract".

## 6. Architectural Invariants

Provider failure never proves low quality. Story-quality failure is not transient provider failure.

## 7. Exact Scope

Fallback evaluator, provenance persistence, warning, and blocking behavior.

## 8. Likely Files And Symbols

- `story-workflow-english.ts`.
- `generated-story-validator.ts`.
- `story-production-analysis.service.ts` or adapter around it.
- `canonical-full-story.persistence.ts` additive fallback fields.

## 9. Required Implementation Behavior

On rewrite failure, persist failure, validate original source, run quality gate, persist source-fallback accepted/rejected, continue or block dependents.

## 10. Required Types

`ArtifactProvenance: "source-fallback"`, fallback warning, typed failures.

## 11. Required State Transitions

rewrite failed -> fallback validation/quality -> canonical succeeded or blocked.

## 12. Required Failure And Fallback Behavior

Only generation/infrastructure failures trigger fallback. Generated content quality failure does not fallback to source unless explicitly classified as provider-side failure.

## 13. Persistence Requirements

Canonical fallback artifact must include original source fingerprint, provenance, quality result, and preserved rewrite failure reference.

## 14. Observability Requirements

Emit warning `source-fallback-accepted` and link original failure.

## 15. Backward-Compatibility Requirements

Do not break existing canonical artifact readers; add fields compatibly.

## 16. Tests And Fixtures

Rewrite provider failure + fallback accepted; rewrite provider failure + fallback rejected; quality failure distinct from provider failure; images blocked when rejected.

## 17. Explicit Non-Goals

No locale fallback.

## 18. Parallelization Constraints

Blocks locale/image branches.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-english.unit.test.ts
pnpm test:focused -- packages/story-localization/src/canonical-full-story.persistence.unit.test.ts
```

## 20. Acceptance Criteria

English provider failure can continue only through accepted source fallback with persisted provenance and failure.

## 21. Requested Commit Message

`feat(workflow): add English source fallback gate`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
