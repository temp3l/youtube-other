# Task 07: Quality Gate Adapter Full And Short

## 1. Role And Context

You are making production quality decisions reusable for workflow stages.

## 2. Required Repository Instructions

Use existing production analysis code as authoritative.

## 3. Objective

Create an adapter that maps deterministic validation and story production analysis verdicts into `QualityGateDecision` for full and short formats.

## 4. Prerequisite Tasks

Task 03.

## 5. Authoritative Planning References

- Master plan "Quality-Gate Map".
- `docs/plans/19-story-production-analysis-plan.md`.

## 6. Architectural Invariants

`READY` passes; `READY_WITH_MINOR_EDITS` passes with warning; all others block.

## 7. Exact Scope

Adapter and tests. Short analysis may use fake/provider abstraction if full implementation remains later.

## 8. Likely Files And Symbols

- `story-production-analysis.ts`: verdict helpers.
- New `story-workflow-quality.ts`.

## 9. Required Implementation Behavior

Take validation result + analysis artifact/status and produce pass/block decision with profile.

## 10. Required Types

`QualityGateDecision`, `QualityGateStatus`.

## 11. Required State Transitions

quality stage succeeded with pass or blocked with quality category.

## 12. Required Failure And Fallback Behavior

Fallback profile may be stricter but defaults to production gate until config exists.

## 13. Persistence Requirements

Decision stored in workflow manifest and references analysis artifact path.

## 14. Observability Requirements

Include qualityStatus and failed gate IDs.

## 15. Backward-Compatibility Requirements

Do not change `deriveStoryProductionVerdict` semantics.

## 16. Tests And Fixtures

All five verdict statuses, deterministic validation precedence, fallback profile warning.

## 17. Explicit Non-Goals

No provider analysis implementation for shorts unless already available.

## 18. Parallelization Constraints

Can run before branch implementation.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-quality.unit.test.ts
pnpm test:focused -- packages/story-localization/src/story-production-analysis.unit.test.ts
```

## 20. Acceptance Criteria

Workflow can make consistent full/short quality decisions from existing verdicts.

## 21. Requested Commit Message

`feat(workflow): adapt production quality gates`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
