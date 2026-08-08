# Task 05: Deployment Process Topology

## Objective

Package the existing codebase into independently deployable API, scheduler,
general-worker, render-worker, webhook-worker, and reconciliation roles.

## Depends On

Tasks 00, 02, and 04.

## Scope

- Add the selected hosting target's minimal deployment manifests and health checks.
- Give each role an explicit entry point, environment schema, least-privilege
  service identity, resource limits, shutdown handling, and egress policy.
- Apply PostgreSQL migrations as a separate controlled release step.
- Define readiness dependencies without making liveness depend on external providers.
- Add local deployment smoke configuration with fake IdP/secrets/object storage.

## Out Of Scope

Production rollout, real DNS/customer traffic, multi-region GA, and provider calls.

## Acceptance

- Every runtime role starts independently and shuts down without abandoning leases.
- API readiness detects required control-plane dependencies.
- A local smoke proves API-to-job-to-worker completion using isolated services.
- No role receives credentials outside its declared need.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
