# MICRO-032 canon-safe learning admission

Date: 2026-08-12
Task: MICRO-032
Status: DONE

## Summary

Added revision-linked LearningFinding and CreativeRecommendation records, canon-protected surface definitions, performance projection helpers, and microdrama admission validation so only explicitly accepted planning-only recommendations enter future planning inputs.

## Changed paths

- `packages/narrative-core/src/canon-protection.ts`
- `packages/domain/src/microdrama-learning-*.ts`
- `packages/performance/src/learning-projection.ts`
- `packages/microdrama/src/learning-admission*.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/narrative-core/src/canon-protection.unit.test.ts` — 2 passed
- `pnpm test:focused -- packages/domain/src/microdrama-learning-lifecycle.unit.test.ts` — 1 passed
- `pnpm test:focused -- packages/performance/src/learning-projection.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/microdrama/src/learning-admission.unit.test.ts` — 3 passed

## Risks

- Persistence and operator UI for recommendation acceptance deferred; admission records are in-memory/domain-only.

## Backlog

- MICRO-032 → DONE
