# Task 04: Relational State And Transitions

## Objective

Make PostgreSQL the durable, queryable authority for API-managed resources and workflow execution.

## Scope

- define tenant-scoped episodes/revisions, runs, steps, attempts, jobs, approvals, assets, publications, and append-only events
- define guarded transition tables for jobs, runs, steps, attempts, batches, and publications
- require revision or lease-fence checks on every mutable transition
- persist immutable run execution specifications and lineage to upgraded runs
- reject late writers and mutation of terminal records

## Out Of Scope

Dispatch loops, API controllers, object migration, and full event sourcing.

## Tests And Verification

Add focused repository integration tests for transactions, composite tenant keys, CAS, transition rejection, terminal immutability, and late fences.

## Acceptance Criteria

Current and historical workflow state is tenant-queryable, all transitions have one owner, and a run can be reproduced from its immutable execution specification.
