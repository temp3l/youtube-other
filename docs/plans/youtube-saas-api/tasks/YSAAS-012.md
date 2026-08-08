# YSAAS-012 — Webhook management and delivery history

## Objective
Expose secure tenant webhooks and observable durable delivery.
## Stories covered
US-044–US-046.
## Dependencies
YSAAS-003, YSAAS-004.
## Existing implementation
Webhook repository/catalog, endpoint provisioning command, signing resolver, HTTPS/DNS transport safeguards, durable worker.
## Required changes
- Domain/persistence: endpoint/filter/version, secret rotation, event/attempt projections, next attempt, terminal state, resend.
- API/SDK/BFF: manage/test/list delivery history with redacted payload metadata.
- Security/audit: HTTPS/SSRF controls, tenant secret, event ID/timestamp tolerance, rotation audit.
- Tests: signature, replay, rotation overlap, 2xx/4xx/5xx, timeout/backoff, cross-tenant delivery history.
## Explicit non-goals
Arbitrary payload editing, redirects/private-network delivery, email/push, or exposing secret headers/bodies.
## File ownership
Webhook modules only; shared credentials/security follow YSAAS-003.
## Acceptance criteria
Subscribed events are uniquely identified and signed; consumers can deduplicate; failures show safe attempt/retry state; resend creates a new attempt for the same event identity.
## Validation
Focused webhook repository/worker/transport/API tests and affected typecheck.
## Completion evidence
Event version list, signature contract, retry table, tests, operational risks.
