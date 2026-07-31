# Codex Run: API Task 20 — Publication Reconciliation

## Summary

Added a read-only publication reconciliation worker. It binds an uncertain intent only when provider recovery evidence produces exactly one receipt; no, multiple, or unavailable results remain `reconciliation_required` and never trigger an upload.

## Changed Paths

- `packages/application/src/{publication-safety,contracts.unit.test}.ts`

## Tests

- Focused application contracts suite — passed (13 tests) after one test-syntax repair.
- `pnpm --filter @mediaforge/application typecheck` — passed.

## Commit Hash

Base: `5cf1262`; changes remain uncommitted.

## Unresolved Risks

PostgreSQL intent/effect persistence, channel leases, YouTube recovery-marker validation, and boundary fault injection still require provider wiring.
