# VRI-20 review events, webhooks, and tenant isolation

## Changed files

- `apps/api/src/contract.ts`
- `apps/api/src/contract.unit.test.ts`
- `apps/api/src/postgres-api-use-cases.ts`
- `packages/application/src/webhooks.ts`
- `packages/application/src/webhooks.unit.test.ts`
- `packages/persistence/src/webhook-event-catalog.ts`
- `packages/persistence/src/postgres-workflow-repository.ts`
- `packages/persistence/src/relational-workflow-state.ts`
- `packages/persistence/src/postgres-webhook-repository.unit.test.ts`
- `docs/api-plan/13-events-and-webhooks.md`

## Tests and checks

- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 apps/api/src/contract.unit.test.ts -t "revision-bound, attributable review scope"` — passed.
- `pnpm test:focused -- packages/application/src/webhooks.unit.test.ts` — passed (13 tests).
- `pnpm test:focused -- apps/api/src/contract.unit.test.ts` — passed (13 tests) after repairing the stale lifecycle/speech inventory and safe wording.

## Results

The approval endpoint accepts bounded revision/artifact review scope and derives the actor from the authenticated principal. Approved actions emit additive `approval.approved`; `approval.created` remains catalogued. Public event data omits free-form review reason/role while the immutable ledger retains them. Existing tenant transactions, RLS, outbox, and webhook redaction remain authoritative.

## Risks and follow-up

No provider activation was enabled. Database-backed webhook integration was not rerun.
