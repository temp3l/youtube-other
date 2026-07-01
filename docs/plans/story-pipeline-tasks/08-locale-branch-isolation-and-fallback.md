# Task 08: Locale Branch Isolation And Fallback

## 1. Role And Context

You are implementing independent non-English locale branches.

## 2. Required Repository Instructions

Follow story-localization guardrails. Mock providers.

## 3. Objective

Add workflow locale stage wrappers so `de/fr/es/pt` full generation, fallback, validation, quality, and blocking are independent.

## 4. Prerequisite Tasks

Tasks 06 and 07.

## 5. Authoritative Planning References

- Master plan "Locale Fallback".
- Existing Task 08 plan.

## 6. Architectural Invariants

One locale failure does not block another or shared English images.

## 7. Exact Scope

Full localized branch only; shorts handled by Task 09.

## 8. Likely Files And Symbols

- `story-localization.service.ts` wrapper.
- `story-production-analysis.persistence.ts`.
- `story-localization-cache.ts`.

## 9. Required Implementation Behavior

Generate localized full; on failure find best same-locale accepted fallback; validate/gate fallback; persist provenance and warnings.

## 10. Required Types

`LocaleWorkflowResult`, `localized-fallback`, locale failure categories.

## 11. Required State Transitions

localize-full planned/running/succeeded/failed; fallback accepted/rejected; locale blocked or continued.

## 12. Required Failure And Fallback Behavior

Fallback precedence: current accepted same-locale artifact with matching canonical fingerprint, previous workflow accepted same-locale artifact, current cache-compatible artifact, future explicit manual artifact only if implemented later.

## 13. Persistence Requirements

Persist localization failure and fallback decision separately.

## 14. Observability Requirements

Report locale, fallbackUsed, provenance, original failure category.

## 15. Backward-Compatibility Requirements

Do not remove existing localized files or cache entries.

## 16. Tests And Fixtures

Each locale success/failure; fallback accepted/rejected/unavailable; one locale failure does not block others.

## 17. Explicit Non-Goals

No short generation, no image generation.

## 18. Parallelization Constraints

Can run parallel with Tasks 09 and 10 after Task 07, but coordinate shared workflow result types.

## 19. Commands To Run

```bash
pnpm test:focused -- packages/story-localization/src/story-workflow-locales.unit.test.ts
```

## 20. Acceptance Criteria

Locale branches are isolated and fallback decisions are persisted.

## 21. Requested Commit Message

`feat(workflow): isolate localized full branches`

## 22. Commit Instruction

Commit only this task.

## 23. Recommended Model

GPT-5.5 Medium, medium reasoning.
