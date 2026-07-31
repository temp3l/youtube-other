# Codex Run: API Task 23 — YouTube Reconciliation Persistence

## Summary

Added append-only PostgreSQL reconciliation evidence and a guarded `reconciliation_required → published` transition that stores an exact provider receipt. Added a read-only YouTube lookup that accepts only returned videos containing the immutable publication marker; upload requests can now persist that marker.

## Changed Paths

- `packages/{application,persistence,youtube-upload}/src/*publication*`
- `packages/persistence/src/{postgres-workflow-repository,relational-workflow-state}.ts`
- `apps/api/src/{index,publication-reconciliation}.ts`
- `apps/api/package.json`, `pnpm-lock.yaml`

## Tests

- `pnpm test:focused -- packages/persistence/src/postgres-workflow-admission.unit.test.ts` — passed (3 tests).
- `pnpm test:focused -- packages/youtube-upload/src/publication-reconciliation.unit.test.ts` — passed (2 tests).
- `pnpm test:focused -- packages/application/src/contracts.unit.test.ts` — passed (14 tests).
- Filtered persistence/youtube-upload/application/API typecheck — passed.

## Commit Hash

Base: `666a973`; changes remain uncommitted.

## Unresolved Risks

Live YouTube credentials, production scheduler/leases, and PostgreSQL fault-injection integration remain environment work.
