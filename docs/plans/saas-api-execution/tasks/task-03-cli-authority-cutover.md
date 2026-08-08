# Task 03: CLI Authority Cutover

## Objective

Remove remaining dual-writer risk by making selected CLI production commands call
the same application use cases and database workflow authority as the API.

## Depends On

Task 02.

## Scope

- Inventory remaining file-oriented write commands for the selected pilot journey.
- Migrate one command family at a time to typed application/API adapters.
- Preserve machine-readable output, exit codes, idempotency, cancellation, and status.
- Enforce `filesystem-legacy` versus `database-v1` authority at admission.
- Keep compatibility files projection-only and legacy import read-only.

## Out Of Scope

Removing all compatibility readers, changing media semantics, and live provider or
YouTube calls.

## Acceptance

- No selected database-owned workflow can be written by a legacy command.
- Packaged CLI parity and authority-rejection tests pass.
- Rollback applies only to new workflow admissions and cannot create two writers.
- Deprecated commands emit actionable migration guidance.

## Likely Files

`apps/cli/src/api-commands.ts`, selected production command adapters,
`packages/application`, and focused CLI tests.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
