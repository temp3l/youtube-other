# MICRO-031 experiments and causal-confidence records

Date: 2026-08-12
Task: MICRO-031
Status: DONE

## Summary

Added revision-linked experiment, assignment, and result records with controlled vs observational causal-confidence classification, evaluation helpers in `@mediaforge/performance`, and additive SQLite persistence.

## Changed paths

- `packages/domain/src/microdrama-experiment-*.ts`
- `packages/performance/src/experiment-*.ts`
- `packages/persistence/src/microdrama-experiment-*.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/domain/src/microdrama-experiment-lifecycle.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/performance/src/experiment-evaluation.unit.test.ts` — 2 passed
- `pnpm test:focused -- packages/persistence/src/microdrama-experiment-domain.unit.test.ts` — 3 passed

## Risks

- Live experiment orchestration and HTTP routes deferred; SQLite repository delegates list/query to fake repository.

## Backlog

- MICRO-031 → DONE
- MICRO-032 → READY
