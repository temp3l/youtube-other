# YSAAS-020 — Developer and integrations frontend

## Objective
Deliver secure self-service credentials, webhooks, delivery diagnosis, and canonical API guidance.
## Stories covered
US-041–US-047.
## Dependencies
YSAAS-004, YSAAS-011, YSAAS-012.
## Existing implementation
Integration page reports disabled controls; API-key/webhook operator commands and generated OpenAPI/SDK exist.
## Required changes
- Frontend/BFF: create/scope/show-once/rotate/revoke credentials; webhook endpoint/filter/test/history/resend; generated API explorer and provider-free example.
- Require confirmation/step-up hook for credential/destructive changes.
- Never serialize secret material after the one authorized creation response.
- Tests: reload after secret creation, rotation overlap/no-overlap, revoke, signature help, failed delivery, cross-tenant routes, WCAG 2.2 AA.
## Explicit non-goals
Manual API contract duplication, arbitrary webhook payloads, plaintext secrets, or OAuth service-account vendor choice.
## File ownership
Developer/integration page and BFF modules only.
## Acceptance criteria
Secret disappears after creation; status identifies keys/endpoints without secrets; history shows safe retries; examples demonstrate idempotency, polling/webhooks, review, and results.
## Validation
Focused BFF/page/security/accessibility tests and web typecheck.
## Completion evidence
Journey screenshots/text states, redaction checks, tests, operational limitations.
