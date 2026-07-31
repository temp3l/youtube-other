# ADR-API-001: Shared Application Layer

- **Status:** Board accepted
- **Date:** 2026-07-31
- **Confidence:** High

## Question

What canonical boundary should CLI, REST, workers, and schedulers use?

## Repository evidence

`WorkflowOperator` is callable TypeScript; canonical math task bindings exist. CLI remains the broad composition root, Dark Truth generic registrations are unbound, and nested CLI subprocess wrappers exist.

## Options

- CLI subprocess: cheap bridge; weak typing/security/cancel/reliability.
- direct packages: faster start; duplicates orchestration in controllers.
- shared typed application/workflow layer: strongest parity/testability and moderate migration.
- separate control service: strongest isolation later; highest premature operational cost.

## Impacts

Security improves through one authorization/side-effect boundary. Operations gain common jobs/traces. Migration requires characterization, task binding, and CLI delegation.

## Recommendation

Adopt a shared tenant-aware application layer around the generic workflow engine in a modular monolith. Use subprocesses only for fixed operator-only transitional adapters.

## Conditions that change it

A proven need for independent scaling/compliance may move the same interfaces into a workflow service after persistence and assets are network-safe.

## Consequences

No production HTTP controller may assemble a workflow from low-level packages or invoke arbitrary CLI syntax.
