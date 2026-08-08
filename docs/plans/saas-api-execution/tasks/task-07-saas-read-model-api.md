# Task 07: SaaS Read-Model API

## Objective

Add the minimal contract-first query operations required by the SaaS without
expanding the command surface or leaking internal persistence details.

## Depends On

Task 01 and the accepted journey from Task 00.

## Scope

- Add signed-in principal/workspace discovery as approved by the auth model.
- Add cursor-paginated project and episode listing/read operations.
- Add asset listing, approval-challenge retrieval, and reconciliation/support
  queries only where Task 01 proves the UI needs them.
- Apply workspace/project permissions, opaque cross-tenant 404 behavior, stable
  sorting, signed cursors, bounded filters, and ETags where state is revisioned.
- Update OpenAPI, SDK, compatibility checks, and thin controller/use-case tests together.

## Out Of Scope

Low-level task endpoints, arbitrary search, raw paths, provider payloads, prompts,
new mutation behavior, and GraphQL.

## Acceptance

- Each new operation exists because a named SaaS screen requires it.
- Controllers invoke one typed query use case and serialize no database DTO directly.
- BOLA, pagination, cursor tamper, permission, contract, and SDK tests pass.
- Existing v1 compatibility policy reports no accidental breaking changes.

## Reports

Create the plan implementation report and Codex run report required by the pack README.
