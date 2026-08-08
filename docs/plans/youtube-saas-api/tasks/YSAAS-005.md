# YSAAS-005 — Workflow portfolio and recovery

## Objective
Deliver tenant portfolio workflow visibility and safe recovery from partial failures.
## Stories covered
US-001, US-007, US-025.
## Dependencies
YSAAS-001, YSAAS-003, YSAAS-004.
## Existing implementation
Durable workflow run/job/step/attempt state; get/cancel/resume endpoints; sanitized job failures; per-run web page.
## Required changes
- Domain/persistence: cursorable portfolio projection with required filters, latest stage/job, timings, blockers, attempts, preserved artifacts, retry classification, and abandon state.
- API/SDK/BFF: domain-owned list/timeline/recovery operations with ETags/idempotency.
- Authorization/audit: `workflow.read/start/cancel` action checks and recovery events.
- Tests: cross-tenant filter isolation, partial failure, resume/retry/abandon, duplicate effect prevention.
## Explicit non-goals
Arbitrary workflow authoring, raw infrastructure logs, provider credentials, or UI implementation.
## File ownership
Workflow modules only; artifact invalidation belongs to YSAAS-006.
## Acceptance criteria
Queue supports status, channel, genre, locale, workflow stage, review/publishing status, assignee, and updated date; failures show safe explanations and only valid recovery actions; upstream artifacts remain bound.
## Validation
Focused workflow repository/API tests and affected typecheck.
## Completion evidence
Filter contract, transition cases, retry semantics, tests, unresolved failure classifications.
