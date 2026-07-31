# Codex Run: API Task 21 — Shared Workflow Admission

## Summary

Added the concrete, authorization- and idempotency-enforcing workflow-admission handler and an HTTP adapter that maps transport input to its application execution context. Connected API composition can now select this handler instead of an injected HTTP-shaped workflow callback.

## Changed Paths

- `packages/application/src/{ports,workflow-admission,index,contracts.unit.test}.ts`
- `apps/api/src/{http-server,http-server.integration.test}.ts`

## Tests

- Focused API/application suites — passed (20 tests) after one test-context repair.
- Application typecheck — passed.
- Targeted application build and API typecheck — passed.

## Commit Hash

Base: `5cf1262`; changes remain uncommitted.

## Unresolved Risks

The production CLI still needs a configured PostgreSQL admission-port composition before its legacy actions can be switched to this handler.
