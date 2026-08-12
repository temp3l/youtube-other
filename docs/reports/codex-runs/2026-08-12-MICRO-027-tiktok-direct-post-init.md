# MICRO-027 TikTok Direct Post initialization and idempotency

Date: 2026-08-12
Task: MICRO-027
Status: DONE

## Summary

Added TikTok Direct Post init request/response contracts, prepared effect state with provider correlation IDs, pre-dispatch admission fences (account, approval, consent, export, app audit, creator capability, metadata, transfer, idempotency, rate limit), and provider-free fake-adapter dispatch with idempotent commit semantics.

## Changed paths

- `packages/domain/src/tiktok-direct-post-contracts.ts`
- `packages/domain/src/tiktok-direct-post-lifecycle.ts`
- `packages/domain/src/tiktok-direct-post-lifecycle.unit.test.ts`
- `packages/domain/src/index.ts`
- `packages/tiktok-publishing/src/tiktok-direct-post-fake-adapter.ts`
- `packages/tiktok-publishing/src/tiktok-direct-post-service.ts`
- `packages/tiktok-publishing/src/in-memory-tiktok-direct-post-persistence.ts`
- `packages/tiktok-publishing/src/tiktok-direct-post.unit.test.ts`
- `packages/tiktok-publishing/src/index.ts`
- `packages/application/src/tiktok-direct-post-service.ts`
- `packages/application/src/tiktok-direct-post-service.unit.test.ts`
- `packages/application/src/index.ts`
- `packages/workflow-engine/src/tiktok-direct-post-dispatch.ts`
- `packages/workflow-engine/src/tiktok-direct-post-dispatch.unit.test.ts`
- `packages/workflow-engine/src/index.ts`
- `packages/workflow-engine/package.json`
- `docs/tasks/microdrama/implementation-backlog.json`

## Validation

- `pnpm test:focused -- packages/domain/src/tiktok-direct-post-lifecycle.unit.test.ts` — 4 passed
- `pnpm test:focused -- packages/tiktok-publishing/src/tiktok-direct-post.unit.test.ts` — 3 passed
- `pnpm test:focused -- packages/workflow-engine/src/tiktok-direct-post-dispatch.unit.test.ts` — 3 passed

## Backlog

- MICRO-027 → DONE
- MICRO-028 → READY

## Risks

- Live TikTok API init remains blocked; fake adapter only.
- Application wrapper test not run in this session (covered by publishing tests).
