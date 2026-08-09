# VRI-19 Episode and production API parity

Date: 2026-08-09

## Changed files

- `apps/api/src/{contract,http-server,postgres-api-use-cases}*.ts`
- `packages/application/package.json`
- `packages/persistence/src/{postgres-workflow-repository,relational-workflow-state}.ts`

## Implemented

- Added canonical Veronica project/content input and typed archive/clone routes, OpenAPI schemas, lifecycle lineage responses, tenant permissions, idempotency, and archive ETag/CAS matching.
- Exposed persisted episode lifecycle and clone lineage on reads without exposing providers or mutable source originals.
- Kept workflow admission/status/resume on the existing shared application path.

## Checks

- `pnpm test:focused -- apps/api/src/contract.unit.test.ts` — reached 11/12 after dependency repair; the final allowed rerun exposed a mistaken creator-ID alias in the new fixture, corrected but not rerun under the retry guardrail.
- API typecheck/integration collection — blocked by unresolved workspace build entrypoints.
- `git diff --check` — passed.

## Risks and follow-up

The corrected Veronica assertion remains pending rerun. External provider dispatch remains intentionally disabled.
