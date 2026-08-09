# YSAAS-013 publication preparation

## Summary
Channel connection state (safe projection), publication metadata revisions, publish-ready preflight, immutable intent preparation, schedule supersede, and cancel for pending intents.

## Changed paths
- `packages/domain/src/publication-preparation-*`
- `packages/persistence/src/postgres-publication-preparation-repository.ts`
- `packages/persistence/src/postgres-workflow-repository.ts` (cancel intent)
- `apps/api/src/postgres-api-publication-preparation-use-cases.ts`
- `apps/api/src/contracts/modules/publication-preparation-paths.ts`
- `packages/api-sdk/src/v1-contract/modules/publication-operations.ts`
- `apps/api/src/http-server.ts`, `postgres-api-use-cases.ts`, OpenAPI registry/components

## Tests
- `pnpm test:focused -- packages/domain/src/publication-preparation-lifecycle.unit.test.ts` — 6 pass
- `pnpm test:focused -- packages/persistence/src/postgres-publication-preparation-repository.unit.test.ts` — 1 pass

## Typecheck
- `pnpm exec tsc -p packages/domain` pass
- `pnpm exec tsc -p packages/persistence` pass
- `apps/api` — no errors in YSAAS-013 files; pre-existing `job-process` / `provider-free-worker-entry` migrate errors remain

## Risks
- Schedule edit supersedes via cancel+admit (not in-place binding mutation).
- Derivative episode / intent insert not one transaction (unchanged).
- OAuth completion is test-helper only; production callback path is YSAAS-014/021 scope.
