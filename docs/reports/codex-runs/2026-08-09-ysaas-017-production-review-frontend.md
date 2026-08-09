# YSAAS-017 production and review frontend

## Changed files

- `apps/api/src/http-server.ts`, `apps/api/src/postgres-api-use-cases.ts`, and workflow OpenAPI contracts expose the tenant/project/episode-scoped canonical production state.
- `packages/api-sdk/src/index.ts` adds production-state, review queue, and approval history clients.
- `apps/web/src/saas-api-bff.ts`, `apps/web/src/saas-modules/api-sdk-gateway.ts`, `apps/web/src/saas-runtime.ts`, and the demo adapter consume those contracts.
- Focused web and API integration tests cover state rendering and the HTTP projection.

## Checks

- `pnpm test:focused -- apps/web/src/saas-runtime.unit.test.ts` — passed (4 tests).
- `pnpm test:focused -- apps/api/src/http-server.integration.test.ts` — passed.
- `pnpm --filter @mediaforge/api-sdk build` — passed.
- `pnpm exec tsc -p apps/web --noEmit` — passed.
- `pnpm exec tsc -p apps/api --noEmit` — passed.

## Risks and follow-up

YSAAS-017 remains partial: the invalidation endpoint requires production-unit snapshots and changes, but there is no tenant-scoped lineage/snapshot read projection for the BFF to build a safe comparison and destructive confirmation. Do not accept browser-entered snapshots or infer them from files. Add that API contract before completing the artifact comparison/invalidation portion.
