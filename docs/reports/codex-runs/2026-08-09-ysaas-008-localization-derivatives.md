# YSAAS-008 localization derivatives implementation

## Summary
Added locale derivative aggregate with immutable source linkage, independent revisions, visual asset reuse links, preflight, comparison, and retry API.

## Changed paths
- `packages/domain/src/localization-derivative*.ts`
- `packages/persistence/src/postgres-localization-derivative-repository.ts`
- `apps/api/src/postgres-api-localization-use-cases.ts`
- `apps/api/src/contracts/modules/localization-paths.ts`
- OpenAPI/SDK localization module registration

## Tests
- `localization-derivative.unit.test.ts` — pass (5)
- `postgres-localization-derivative-repository.unit.test.ts` — pass (1)
- `pnpm exec tsc -p packages/domain` / persistence / apps/api — pass except known worker `migrate` errors

## Risks
- Derivative episode creation and derivative row insert are not one DB transaction.
- Batch preflight (YSAAS-009 scope) not included.

## Follow-up
- Commit/push; Wave 4 YSAAS-013 or YSAAS-009 per roadmap.
