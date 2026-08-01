# API episode content replacement

## Changed files

- `apps/api/src/{http-server,postgres-api-use-cases,contract}.ts`
- Focused API contract, facade, and HTTP tests
- `packages/api-sdk/src/index.ts` and its unit test

## Summary

Added typed `PATCH /v1/workspaces/{workspace}/projects/{project}/episodes/{episode}` full-content replacement. The route requires `content.write` and a strong `If-Match`. The PostgreSQL facade checks scoped existence and current revision before CAS, records server-owned actor/request revision evidence, maps missing resources to opaque 404, and maps observed or concurrent staleness to 412. The updated episode and strong ETag are returned.

## Tests and checks

- API/OpenAPI/SDK/application contract unit run: 30 passed; one facade test initially failed against stale persistence build output.
- Refreshed only `@mediaforge/persistence` build output; repaired facade test passed.
- HTTP integration: 12 passed.
- API and SDK typechecks: passed.
- Targeted `git diff --check`: passed.

## Risks and follow-up

- No PostgreSQL integration test was added; the persistence CAS itself has focused unit coverage from its owning task.

Commit at execution: `69c62f2` (changes uncommitted).
