# API structured job failures

## Changed files

- `apps/api/src/{http-server,postgres-api-use-cases,contract}.ts`
- `apps/api/src/{http-server.integration,postgres-api-use-cases.unit,contract.unit}.test.ts`
- `packages/api-sdk/src/index.ts`
- `packages/api-sdk/src/index.unit.test.ts`

## Summary

GET job responses now expose attempt count and cancellation-request state. Failed and dead-lettered jobs include a stable nested problem with a public code and generic remediation-safe detail. Raw persisted worker/provider error text remains internal. Non-terminal and successful jobs cannot carry the failure property under the OpenAPI 3.1 schema. SDK job types match the wire contract.

## Tests and checks

- Focused API/OpenAPI/SDK unit tests: 13 passed.
- Focused HTTP integration tests: 10 passed.
- API and SDK typechecks: passed after concurrent API-key work was corrected by its owner.
- Targeted `git diff --check`: passed.

## Risks and follow-up

- Both public failure kinds are non-retryable because no public retry operation exists yet.
- Detailed diagnostics remain available only through internal operational surfaces.

Commit at execution: `69c62f2` (changes uncommitted).
