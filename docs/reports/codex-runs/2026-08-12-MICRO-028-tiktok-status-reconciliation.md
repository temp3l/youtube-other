# MICRO-028 TikTok status reconciliation

Date: 2026-08-12
Task: MICRO-028
Status: DONE

## Summary

Added TikTok Direct Post effect reference contracts (for MICRO-027), status query/reconciliation domain logic with Retry-After handling, fake publish-status adapter, and application persistence for OUTCOME_UNCERTAIN read-only recovery without duplicate dispatch.

## Changed paths

- `packages/domain/src/tiktok-direct-post-contracts.ts`
- `packages/domain/src/tiktok-direct-post-lifecycle.ts`
- `packages/domain/src/tiktok-status-reconciliation-contracts.ts`
- `packages/domain/src/tiktok-status-reconciliation-lifecycle.ts`
- `packages/domain/src/tiktok-status-reconciliation-lifecycle.unit.test.ts`
- `packages/domain/src/index.ts`
- `packages/tiktok-publishing/src/tiktok-status-reconciliation-service.ts`
- `packages/tiktok-publishing/src/tiktok-status-reconciliation.unit.test.ts`
- `packages/tiktok-publishing/src/index.ts`
- `packages/application/src/tiktok-status-reconciliation-service.ts`
- `packages/application/src/tiktok-status-reconciliation-service.unit.test.ts`
- `packages/application/src/index.ts`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/domain/src/tiktok-status-reconciliation-lifecycle.unit.test.ts` — 7 passed
- `pnpm test:focused -- packages/tiktok-publishing/src/tiktok-status-reconciliation.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/application/src/tiktok-status-reconciliation-service.unit.test.ts` — 1 passed

## Backlog

- MICRO-028 → DONE

## Risks

- MICRO-027 dispatch executor still required before end-to-end publication flow.
- Live TikTok status API wiring remains behind fake adapter until provider canary.
