# YSAAS-009 — Bulk production and localization

## Objective
Provide safe, observable batch production and localization with per-item outcomes.
## Stories covered
US-015, US-020, US-021, US-023.
## Dependencies
YSAAS-002, YSAAS-003, YSAAS-005–YSAAS-008.
## Existing implementation
Domain batch manifests/items, workflow batches, review-pack aggregation, current one-item pilot quota.
## Required changes
- Domain/persistence: batch preflight, item eligibility, child command/run IDs, aggregate progress, partial failure, safe retry/cancel.
- API/SDK/BFF: filter-based selection and asynchronous batch/result operations.
- Authorization/audit: reauthorize every item and record selection basis/results.
- Tests: mixed entitlement, quota reservation, partial failure, duplicate batch/item request, stale item revision.
## Explicit non-goals
GA-scale tuning, billing, unbounded selection, or frontend work.
## File ownership
Batch modules only; delegates item work to workflow/localization/review services.
## Acceptance criteria
Mixed batches admit only eligible items; every item returns a result/reason; retry reuses successful items and does not duplicate effects; totals reflect cache/reuse.
## Validation
Focused batch/domain/API tests and affected typecheck.
## Completion evidence
Batch limits, item-state table, retry/idempotency results, tests, scale risks.
