# YSAAS-007 — Review lifecycle and validity

## Objective
Complete the actionable review lifecycle around the existing exact approval decision.
## Stories covered
US-002, US-026–US-029.
## Dependencies
YSAAS-001, YSAAS-003, YSAAS-004, YSAAS-006.
## Existing implementation
Approval challenge/record/revoke contracts, immutable persistence, hash/revision/expiry checks, approve/reject BFF controls.
## Required changes
- Domain: quorum one; profile-required review; optional explicit assignment/claim; reviewer separation; request-changes; evidence-set/config-fingerprint validity; override rules.
- API/SDK/BFF: actionable tenant queue, submit/claim/decide/history projections and current validity.
- Authorization/audit: reviewer role, owner/admin override with required rationale, immutable events.
- Tests: stale/expired/consumed challenge, producer separation, concurrent claims/decisions, request-changes, non-overridable safety gates.
## Explicit non-goals
Multi-reviewer quorum, automatic assignment optimization, email/push, or weakening the existing decision contract.
## File ownership
Approval modules only; artifact evidence is owned by YSAAS-006.
## Acceptance criteria
Only current actionable challenges appear; approve rationale is optional while reject/request-changes/override require it; one competing decision wins; historical decisions are never rewritten.
## Validation
Focused approval persistence/API tests and affected typecheck.
## Completion evidence
Policy matrix, concurrency cases, audit samples, tests, migration risks.
