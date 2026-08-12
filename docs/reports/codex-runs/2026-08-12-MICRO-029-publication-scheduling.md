# MICRO-029 publication scheduling and operator controls

Date: 2026-08-12
Task: MICRO-029
Status: DONE

## Summary

Added provider-free publication scheduling with UTC instants, explicit audience timezone profiles, `DispatchMode` gates, schedule-time consent fences, TikTok audit enablement for `PREAPPROVED_SCHEDULED`, cancellation, and dispatch revalidation across domain, persistence, and application layers.

## Changed paths

- `packages/domain/src/microdrama-publication-scheduling-*.ts`
- `packages/persistence/src/microdrama-publication-scheduling-*.ts`
- `packages/application/src/microdrama-publication-scheduling-service.ts`
- `packages/{domain,persistence,application}/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/domain/src/microdrama-publication-scheduling-lifecycle.unit.test.ts` — 5 passed
- `pnpm test:focused -- packages/persistence/src/microdrama-publication-scheduling-domain.unit.test.ts` — 2 passed

## Risks

- Scheduler worker registration remains a follow-up; records and gates are persisted only.
- CLI operator commands deferred; application service is the integration surface.

## Backlog

- MICRO-029 → DONE
