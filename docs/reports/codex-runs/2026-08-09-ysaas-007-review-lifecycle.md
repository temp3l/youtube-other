# YSAAS-007 review lifecycle implementation

## Summary
Completed actionable review lifecycle: queue, submit, claim, decide (with `request_changes`), history, and validity projections around existing approval persistence.

## Changed paths
- `packages/domain/src/review-lifecycle*.ts`
- `packages/persistence/src/postgres-review-repository.ts`
- `apps/api/src/postgres-api-review-use-cases.ts`
- `apps/api/src/contracts/modules/review-paths.ts`
- `apps/api/src/postgres-api-use-cases.ts` (wire review use cases; fixed accidental duplicate block)
- OpenAPI/SDK + webhook catalog for `approval.request_changes`

## Tests
- `pnpm test:focused -- packages/domain/src/review-lifecycle.unit.test.ts` — pass (7)
- `pnpm test:focused -- packages/persistence/src/postgres-review-repository.unit.test.ts` — pass (1)
- `pnpm exec tsc -p packages/domain` / persistence / apps/api — pass except known `migrate` errors in job worker files

## Risks
- Integration tests not run; concurrent claim/decision paths need DB integration coverage.
- Override admission checks high-risk/publish gates only at API layer when `override` is set.

## Follow-up
- Commit YSAAS-007; continue roadmap per `parallel-execution.md`.
