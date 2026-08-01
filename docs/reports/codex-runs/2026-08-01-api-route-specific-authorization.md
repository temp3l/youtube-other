# API route-specific authorization

## Changed files

- `apps/api/src/http-server.ts`
- `apps/api/src/http-server.integration.test.ts`
- `apps/api/src/contract.ts`
- `apps/api/src/contract.unit.test.ts`

## Summary

Mapped each implemented workspace route to the approved permission vocabulary. Workflow admission and resume require `workflow.start`; cancellation requires `workflow.cancel`; validations require `validation.read`; approvals require `approval.decide`; content routes use `content.read` or `content.write`. Unknown operations remain `404`, cross-workspace access remains opaque, and permission checks run before command preconditions or body parsing. OpenAPI operation descriptions now identify required permissions.

## Tests and checks

- `pnpm test:focused -- apps/api/src/http-server.integration.test.ts` — passed, 10 tests.
- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 apps/api/src/contract.unit.test.ts` — passed, 5 tests.
- `pnpm --filter @mediaforge/api typecheck` — passed.
- `git diff --check -- apps/api/src/http-server.ts apps/api/src/http-server.integration.test.ts apps/api/src/contract.ts apps/api/src/contract.unit.test.ts` — passed.

## Risks and follow-up

- Workflow status reads use `content.read` until a dedicated workflow-read permission is approved.
- Existing provisioned principals using legacy permission names must be migrated operationally.

Commit at execution: `69c62f2` (changes uncommitted).
