# Task 05: Durable Dispatch, Idempotency, And Outbox

## Objective

Provide crash-safe job admission and execution without adding a message broker.

## Scope

- implement PostgreSQL job claims with renewable fenced leases, heartbeats, attempts, retry schedules, and dead letters
- atomically store command admission, idempotency response, state changes, and outbox rows
- implement canonical same-key replay and different-fingerprint conflict behavior
- enforce active-workflow and immutable-publication uniqueness separately from HTTP idempotency
- add generic effect records with `prepared`, `in_flight`, `outcome_uncertain`, and `reconciled` states

## Tests And Verification

Add two-worker claim, lease-expiry, late-writer, concurrent-admission, replay, outbox-loss, and database-unavailable fault tests.

## Acceptance Criteria

Concurrent equal keys produce one command, no live lease is reclaimed, state and outbox cannot diverge, and uncertain effects are never blindly retried.
