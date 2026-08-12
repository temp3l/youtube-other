# MICRO-030 revision-linked analytics observations

Date: 2026-08-12
Task: MICRO-030
Status: DONE

## Summary

Added revision-linked microdrama performance observations with immutable raw provider payloads, versioned null-aware normalization, locale/publication identity, baseline annotations, new `@mediaforge/performance` ingestion package with fake provider fixtures, and append-only idempotent SQLite persistence.

## Changed paths

- `packages/domain/src/microdrama-performance-*.ts`
- `packages/performance/**`
- `packages/persistence/src/microdrama-performance-*.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/domain/src/microdrama-performance-normalization.unit.test.ts` — 4 passed
- `pnpm test:focused -- packages/performance/src/performance-ingestion.unit.test.ts` — 2 passed
- `pnpm test:focused -- packages/persistence/src/microdrama-performance-domain.unit.test.ts` — 3 passed

## Risks

- Live provider ingestion and HTTP routes deferred; SQLite repository delegates validation to fake repository.

## Backlog

- MICRO-030 → DONE
- MICRO-031 → READY
