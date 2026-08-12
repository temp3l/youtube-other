# MICRO-020 embedded publication domain

Date: 2026-08-12
Task: MICRO-020
Status: DONE

## Summary

Added embedded provider-specific publication domain with target profiles, consent/export approval revisions, immutable intent and attempt identities, idempotency state machines, provider correlation evidence, application service, workflow dispatch gate, SQLite migration, and provider-free fake repository tests.

## Changed paths

- `packages/domain/src/microdrama-publication-*.ts`
- `packages/application/src/microdrama-publication-service.ts`
- `packages/persistence/src/microdrama-publication-*.ts`
- `packages/workflow-engine/src/microdrama-publication-dispatch.ts`
- `vitest.unit.config.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/persistence/src/microdrama-publication-domain.unit.test.ts` — 5 passed

## Risks

- SQLite repository delegates in-memory validation to fake repository; integration coverage deferred to later publication tasks.

## Backlog

- MICRO-020 → DONE
- MICRO-021, MICRO-022, MICRO-025, MICRO-030 → READY
