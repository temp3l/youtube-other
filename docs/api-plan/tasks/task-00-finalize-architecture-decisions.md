# Task 00: Finalize Architecture Decisions

## Objective

Reconcile the independent review before production implementation begins.

## Scope

- remove contradictory proposed/approved states from the decision register
- record the final operator approval checklist and architecture-review verdict
- normalize idempotency, resume, webhook, error, publication-revocation, and asset-cutover decisions
- align ADR and plan status with the authoritative register

## Out Of Scope

Production code, schemas, dependencies, provider calls, and runtime configuration.

## Implementation Steps

1. Give every decision one status: board accepted, pending operator approval, or blocked on evidence.
2. Record immutable run snapshots and linked-run upgrade semantics.
3. Record generic external-effect and publication-revocation state rules.
4. Record one error-code, webhook-envelope, and idempotency contract.
5. Record the pilot capability matrix and operational approvals.
6. Update risks, backlog, ADR statuses, and plan status without duplicating decisions.

## Verification

Run `./scripts/validate-api-plan.sh`, targeted Prettier checks, and `git diff --check -- docs/api-plan`.

## Acceptance Criteria

An implementer can determine every prerequisite and blocker from one decision register, and no document claims unsupported operator approval.
