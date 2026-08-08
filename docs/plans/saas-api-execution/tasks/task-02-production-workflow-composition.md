# Task 02: Production Workflow Composition

## Objective

Make the admitted `episode-production` job execute the selected canonical profile
through injected typed services, while retaining fail-closed provider controls.

## Depends On

Tasks 00–01.

## Scope

- Inspect the selected profile registry and current `job-process` composition.
- Compose the canonical runner from application ports; do not shell out to CLI.
- Propagate actor/workspace context, deadline, abort signal, lease fence,
  idempotency identity, approval evidence, and provider authorization.
- Quarantine partial binary outputs and classify retryable, terminal, and
  reconciliation-required outcomes.
- Bind only the Task 00 entitlement matrix; unsupported cells fail explicitly.

## Out Of Scope

Live paid calls, publication mutation, generic arbitrary task dispatch, and a
second implementation of story/math/media stages.

## Acceptance

- A provider-free persisted workflow runs through the real canonical registry.
- Cancellation/deadline/fence tests prove no late completion can commit.
- Uncertain external effects never enter automatic retry.
- Focused `job-process` and selected-profile adapter tests plus one affected
  package typecheck pass.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
