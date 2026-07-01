# Task 13: Cost Budgets And Telemetry

## 1. Role And Context

You are making workflow costs visible and enforceable.

## 2. Required Repository Instructions

Use existing observability and cost helpers.

## 3. Objective

Add preflight estimates, budget enforcement, actual cost reconciliation, cache savings, and workflow telemetry fields.

## 4. Prerequisite Tasks

Tasks 03 and 07.

## 5. Authoritative Planning References

- Master plan "Cost Controls" and "Observability".
- Existing Task 15 plan.

## 6. Architectural Invariants

Budget blocks are typed stage outcomes, not silent skips.

## 7. Exact Scope

Cost/budget adapter and report fields.

## 8. Likely Files And Symbols

- `observability/src/telemetry.ts`.
- `story-generation-preflight.ts`.
- `story-localization.cost-tracker.ts`.
- workflow cost module.

## 9. Required Implementation Behavior

Estimate and enforce workflow/stage/locale/image budgets; record actual usage/cost when available.

## 10. Required Types

`CostMetrics`, budget failure categories.

## 11. Required State Transitions

Budget exceeded -> blocked for scoped stage and dependents only.

## 12. Required Failure And Fallback Behavior

Budget blocks are retry-after-budget-change.

## 13. Persistence Requirements

Manifest stores estimates, actuals, cache hits, and budget decisions.

## 14. Observability Requirements

Expose cost per episode, locale, format, stage, provider, and cache savings.

## 15. Backward-Compatibility Requirements

Do not change existing telemetry report schema incompatibly; add fields.

## 16. Tests And Fixtures

Budget allowed/exceeded; locale budget blocks one locale; image budget blocks images only; cost reconciliation.

## 17. Explicit Non-Goals

No pricing catalog overhaul.

## 18. Parallelization Constraints

Parallel with batch adapter.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-cost.unit.test.ts
pnpm test:focused -- packages/observability/src/index.unit.test.ts
```

## 20. Acceptance Criteria

Costs and budget blocks are granular and observable.

## 21. Requested Commit Message

`feat(workflow): add story pipeline cost budgets`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
