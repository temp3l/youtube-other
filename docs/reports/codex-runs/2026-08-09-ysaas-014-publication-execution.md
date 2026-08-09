# YSAAS-014 publication execution

## Changed files
- `packages/application/src/publication-execution.ts` and its focused fault test
- Publication intent persistence and preparation use cases
- `apps/api/src/publication-execution.ts` internal composition seam
- `docs/decisions/ADR-OPERATIONS-001-current-scope-and-publication-authority.md`

## Checks
- `pnpm test:focused -- packages/application/src/publication-execution.unit.test.ts` — 7 passed
- `pnpm exec tsc -p packages/persistence --noEmit` — passed

## Result
Publication execution defaults off and does not claim leases or call a provider
while disabled. When explicitly composed as enabled, it rechecks immutable
authority, metadata, and fences; uploads privately; bounds metadata retries;
and sends upload ambiguity to existing reconciliation.

## Risks and follow-up
No production provider/OAuth composition or public mutation route is enabled.
Manual operator recovery remains the existing reconciliation/read path. Next:
YSAAS-021 or Wave 5 per the implementation ledger.
