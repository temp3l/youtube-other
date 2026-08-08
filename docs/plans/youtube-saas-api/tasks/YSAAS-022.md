# YSAAS-022 — Onboarding, search, action center frontend

## Objective
Complete tenant onboarding and cross-product navigation/lifecycle UX.
## Stories covered
US-038–US-040, US-048–US-060, US-061–US-062.
## Dependencies
YSAAS-001–YSAAS-007, YSAAS-013, YSAAS-015–YSAAS-017.
## Existing implementation
OIDC session, operator-provisioned principal, first project/brief flow, sidebar, audit/usage views; no global search/action center/archive/member UI.
## Required changes
- Frontend/BFF: membership/roles, readiness checklist, first-success path, provider/channel handoffs, clone/templates/archive/restore/delete/retention.
- Search only episode title/slug/ID and run ID for v1.
- Action center covers domain events, active for 30 days; audit retention remains separate.
- Safe destructive confirmations and conflict reload/reapply; no automatic merge.
- Tests: revoked membership, first-run modes, search leakage, expired action, retention constraint, WCAG 2.2 AA.
## Explicit non-goals
Public signup, artifact-content indexing, email/push, custom roles, semantic merge, or legal retention rules.
## File ownership
Onboarding/search/action/lifecycle page modules; audit authority remains backend-owned.
## Acceptance criteria
New tenant reaches provider-free first success; search never leaks forbidden resources; actions deep-link to current state; destructive effects show scope and reject stale confirmation.
## Validation
Focused BFF/page/security/accessibility tests and web typecheck.
## Completion evidence
Journey states, search fields, action retention behavior, tenant probes, tests, risks.
