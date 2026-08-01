# API usage and audit read surfaces

## Changed files

- `apps/api/src/{http-server,postgres-api-use-cases,contract}.ts`
- Focused API contract, facade, and HTTP tests
- `packages/api-sdk/src/index.ts` and its unit test

## Summary

Added tenant-scoped quota, usage-record, and audit-event GET routes. Quota/usage require `usage.read`; audit requires `audit.read`. Quota absence returns 404 instead of an invented policy. PostgreSQL bigint values are encoded as decimal strings. Usage and audit lists use HMAC-signed cursors bound to workspace and collection, including bounded page-size handling. SDK read and iteration helpers match the OpenAPI contract.

## Tests and checks

- API/OpenAPI/SDK unit tests: 15 passed.
- HTTP integration tests: 11 passed.
- Tenant-bound cursor focused test: passed.
- API and SDK typechecks: passed.
- Targeted `git diff --check`: passed.

## Risks and follow-up

- Public quota policy mutation remains intentionally unavailable.
- Audit `data` remains the already-persisted structured fact; producers must continue enforcing the repository redaction policy.

Commit at execution: `69c62f2` (changes uncommitted).
