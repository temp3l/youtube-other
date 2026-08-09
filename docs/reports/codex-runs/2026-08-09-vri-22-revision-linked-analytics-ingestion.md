# VRI-22 revision-linked analytics ingestion

Date: 2026-08-09

## Changed files

- `packages/domain/src/genre-production-intelligence.ts` and focused test
- `packages/persistence/src/postgres-revision-analytics-repository.ts`, workflow repository adapter, exports, and focused test
- `apps/api/src/{contract,http-server,postgres-api-use-cases,revision-analytics-contract,index}*.ts`

## Result

Added bounded canonical analytics observations linked to an episode, edition revision, exact published intent revision, configuration, dependencies, and provenance. PostgreSQL storage is versioned, append-only, tenant-RLS-bound, dispatch-disabled, and concurrency-safe for fingerprint-verified idempotent replay. The authenticated `content.write` HTTP route requires `Idempotency-Key`, normalizes aliases, verifies episode/profile/publication bindings, and reports replay without dispatching providers.

## Checks

- Domain focused test — passed (1).
- Domain build — passed after the final contract change.
- Persistence focused test — passed (1) after stale build repair.
- API contract, HTTP, and use-case tests were added but not run because the three-command task budget was exhausted.
- `git diff --check` — passed.

## Risks

No live analytics fetcher is enabled. Added API tests remain pending the Wave 8 acceptance run.
