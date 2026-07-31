# Task 03: Application Contracts And Composition

## Objective

Create the single typed application boundary used by CLI, API, workers, schedulers, and tests.

## Scope

- define strict command, query, result, actor, workspace, authorization, idempotency, correlation, deadline, and abort contracts
- define stable use-case errors independent of HTTP and CLI formatting
- define repositories and ports for workflow, jobs, assets, approvals, providers, render, publish, audit, usage, clock, and IDs
- move handler construction into a shared composition root outside CLI commands

## Out Of Scope

HTTP routes, PostgreSQL adapters, provider rewrites, and behavior changes.

## Tests And Verification

Add runtime-schema, in-memory port-conformance, and dependency-boundary tests. Run the directly affected test file, then at most one affected-package typecheck.

## Acceptance Criteria

CLI and tests construct the same handlers; public contracts contain no path, argv, provider payload, `any`, or service-locator escape hatch.
