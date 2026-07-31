# Task 09: Contract-First Internal API

## Objective

Implement the reviewed `/v1` contract as thin adapters over shared use cases.

## Scope

- publish and contract-test OpenAPI schemas before controller behavior
- implement typed projects, episodes, workflow admission/status, assets, validations, and approval challenges
- implement RFC 9457 problems, stable error codes, ETags, cursors, idempotency headers, and asynchronous links
- define persisted job failures using the same stable problem vocabulary
- keep long-running execution disabled until Task 10 passes

## Out Of Scope

Public internet exposure, YouTube publication, synchronous FFmpeg/provider calls, low-level step endpoints, and local paths.

## Tests And Verification

Add schema fixtures, breaking-contract checks, controller-to-one-use-case tests, and API integration tests with fake identity/providers.

## Acceptance Criteria

Controllers contain transport mapping only, every accepted long command returns stable resource IDs, and no response exposes internal package, path, CLI, or provider details.
