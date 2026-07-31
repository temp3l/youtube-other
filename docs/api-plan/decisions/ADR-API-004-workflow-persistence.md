# ADR-API-004: Workflow Persistence

- **Status:** Board accepted
- **Date:** 2026-07-31
- **Confidence:** High

## Question

What is authoritative for multi-user, multi-worker execution?

## Repository evidence

Generic JSONL/state projections have valuable history but multiple specialized file stores exist; SQLite stores only episode JSON and is not used as workflow authority. Cross-process CAS, transactional dispatch, and tenant queries are absent.

## Options

JSON authority cannot safely scale; relational state alone lacks rich history; full event sourcing is high complexity; a durable framework is not present; relational current state plus append-only events and JSON compatibility is incremental.

## Impacts

SQL enables authorization queries, leases, optimistic concurrency, idempotency, and outbox. Append-only events retain forensics. Migration needs importers and authority markers.

## Recommendation

PostgreSQL current-state authority plus workflow/audit event history, database job leases, and outbox. JSON becomes read-only import/export compatibility. Avoid full event sourcing and a durable framework in v1.

## Conditions that change it

Offline CLI requirements may retain SQLite/local adapters for isolated workspaces. Proven long-timer/fan-out needs may add a durable framework without moving business authority into it.

## Consequences

One workflow instance has one writable authority.
