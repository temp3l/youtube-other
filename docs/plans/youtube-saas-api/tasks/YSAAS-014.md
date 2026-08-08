# YSAAS-014 — Publication execution and recovery

## Objective
Absorb existing SaaS Task 14 into one feature-flagged, private-first, ambiguity-safe publication command path.
## Stories covered
US-033–US-037.
## Dependencies
YSAAS-003, YSAAS-006, YSAAS-007, YSAAS-013.
## Existing implementation
Resumable YouTube adapter, immutable intent/effect records, channel/intent fences, recovery marker lookup, reconciliation worker; API currently fixes publication mode to none.
## Required changes
- Record the superseding operations decision; add default-off platform capability flag.
- Application/persistence: idempotent publish/metadata commands, immediate authority recheck, private upload, processing validation, visibility/schedule transition, checkpoints, bounded retry, manual recovery.
- API/SDK/BFF: mutation/status operations absent or unavailable while flag off.
- Security/audit: explicit authorization/confirmation, tenant OAuth handle, complete effect audit.
- Tests: fault injection around every provider/local commit boundary, duplicate command, stale approval/token, late fence, metadata-only retry.
## Explicit non-goals
Public-first upload, automatic ambiguity guesses, unbounded retries, contractual recovery SLO, or enabling the flag in production.
## File ownership
Sole publication execution owner; supersedes, not duplicates, existing Task 14.
## Acceptance criteria
Every fault yields exactly one private video or reconciliation-required; publishing failure never regenerates media; transient retries are bounded; flag-off behavior has zero provider mutation.
## Validation
Focused publication/reconciliation/fault tests and affected typecheck; live smoke only with explicit authority.
## Completion evidence
Flag behavior, fault matrix, idempotency/fence results, provider-effect count, tests, enablement blockers.
