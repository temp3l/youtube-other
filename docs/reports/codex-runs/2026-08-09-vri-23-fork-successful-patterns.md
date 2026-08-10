# VRI-23 Fork from successful patterns

Date: 2026-08-09

## Changed files

- `packages/persistence/src/postgres-workflow-repository.ts`
- `apps/api/src/{contract.ts,http-server.ts,postgres-api-use-cases.ts}`
- `packages/api-sdk/src/{index.ts,v1-contract.ts}`
- `apps/cli/src/api-commands.ts`
- Focused unit tests beside each changed boundary.

## Implemented

- Added an idempotent `:fork-pattern` command that accepts only one immutable canonical Veronica source revision.
- Requires `patternId` to resolve to an immutable analytics observation for the source episode and verifies its configuration, dependency fingerprint, and provenance hash before writing lineage evidence.
- Creates an active draft only; it neither copies approvals nor admits workflow/provider work.
- Added matching OpenAPI, HTTP, SDK, and connected-CLI surfaces guarded by `content.write` and an idempotency key.

## Checks

- `pnpm --filter @mediaforge/api-sdk build` — passed.
- `pnpm test:focused -- apps/cli/src/api-commands.unit.test.ts` — passed (8 tests); initial collection was blocked until the API SDK was built.
- `pnpm test:focused -- apps/api/src/postgres-api-use-cases.unit.test.ts` — blocked before collection by the unavailable `@mediaforge/application` workspace entrypoint.
- `git diff --check` — passed.

## Risks and follow-up

The broader API dependency chain remains unavailable for focused collection. Provider dispatch and approval inheritance remain intentionally disabled.
