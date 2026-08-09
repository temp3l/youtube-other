# VRI-24 cross-format and locale analytics comparisons

## Changed files

- `packages/domain/src/revision-analytics-comparison.ts`
- `packages/domain/src/revision-analytics-comparison.unit.test.ts`
- `packages/domain/src/index.ts`
- `packages/persistence/src/postgres-revision-analytics-repository.ts`
- `packages/persistence/src/postgres-revision-analytics-repository.unit.test.ts`
- `apps/api/src/revision-analytics-comparison-contract.ts`
- `apps/api/src/revision-analytics-comparison-contract.unit.test.ts`
- `apps/api/src/revision-analytics-comparison-use-case.ts`
- `apps/api/src/{contract.ts,http-server.ts,postgres-api-use-cases.ts,index.ts}` and focused tests

## Tests and checks

- `pnpm test:focused -- packages/domain/src/revision-analytics-comparison.unit.test.ts` — passed (2 tests).
- `pnpm test:focused -- apps/api/src/revision-analytics-comparison-contract.unit.test.ts` — passed.
- `pnpm test:focused -- packages/persistence/src/postgres-revision-analytics-repository.unit.test.ts` — passed (3 tests) after building the affected domain package.
- `pnpm --filter @mediaforge/domain typecheck` — passed.
- `pnpm --filter @mediaforge/domain build` — passed.

## Results

Added immutable, canonical cross-locale/format comparison artifacts labeled `observational-non-causal`. Each result records source publication, edition/configuration, dependency, provenance, and fingerprint evidence. The tenant-RLS store distinguishes admission replay from content-identity reuse. OpenAPI/HTTP and the PostgreSQL facade require `content.write`, project ownership, and idempotency. No profile mutation or provider dispatch is possible.

## Risks and follow-up

The central API suite was not run because VRI-23 exhausted its focused-test budget and its use-case test remains dependency-entrypoint blocked.
