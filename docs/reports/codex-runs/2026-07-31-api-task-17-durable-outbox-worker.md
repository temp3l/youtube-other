# Codex Run: API Task 17 — Durable Outbox Worker

## Summary

Added a one-event durable dispatcher with fenced outbox leases, acknowledged delivery, bounded rescheduling, and retained dead-letter state. Delivery is intentionally at-least-once; the immutable outbox ID is passed to consumers for deduplication.

## Changed Paths

- `packages/application/src/{durable-outbox-worker,index,contracts.unit.test}.ts`
- `packages/persistence/src/{postgres-workflow-repository,relational-workflow-state}.ts`

## Tests

- `pnpm exec vitest run packages/application/src/contracts.unit.test.ts --bail=1` — passed (11 tests).
- `pnpm --filter @mediaforge/persistence typecheck` — passed.

## Commit Hash

Base: `5cf1262`; changes remain uncommitted.

## Unresolved Risks

Worker process composition, workspace scheduling, webhook transport, and production PostgreSQL fault-injection remain to be wired.
