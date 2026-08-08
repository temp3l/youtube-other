# YSAAS-010 — Usage, quotas, provider health

## Objective
Complete advisory preflight, authoritative usage, quota reservation/reconciliation, and safe provider health.
## Stories covered
US-021–US-024.
## Dependencies
YSAAS-002–YSAAS-004.
## Existing implementation
Quota/usage/audit APIs, `PostgresUsageAuditRepository`, speech estimates/ledger, provider-free UI state.
## Required changes
- Domain: standard usage dimensions, estimate basis/confidence, cache/reuse effects, reservation lifecycle, health states and explicit fallback.
- API/BFF/SDK: filters by episode/run/genre/provider/time, freshness, preflight, health/test status.
- Authorization/audit: privileged usage/config reads; audit corrections, tests, overrides.
- Tests: reservation races, hard/soft limits, reconciliation, stale health, provider-free zero external cost.
## Explicit non-goals
Invoices, provider billing API dependency, silently substituting providers, or live credential entry.
## File ownership
Usage/quota/provider-health modules; speech provider abstraction remains canonical.
## Acceptance criteria
Admission reserves expensive capacity where configured; actual usage settles it; hard limits create no effect; estimates identify reuse; health uses only the five approved states.
## Validation
Focused usage/quota/speech/contract tests and affected typecheck.
## Completion evidence
Units/dimensions, reservation transitions, health mapping, tests, reconciliation risks.
