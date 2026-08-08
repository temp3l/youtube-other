# YSAAS-011 — API credentials and developer journey

## Objective
Make tenant service credentials and the canonical external workflow journey product-accessible and retry-safe.
## Stories covered
US-041–US-043, US-047.
## Dependencies
YSAAS-003, YSAAS-004.
## Existing implementation
Hashed pilot API keys/admin command/authenticator, principal directory, OpenAPI and typed SDK; project/episode create lacks durable keys.
## Required changes
- Domain/persistence: named/scoped credential lifecycle, show-once secret result, configurable overlap, last-use metadata, durable create/start replay.
- API/SDK: credential operations and generated examples for create → workflow → review → result.
- Authorization/audit: tenant owner/admin only; key IDs not secrets in audit.
- Tests: show once, rotate/revoke/overlap, cross-tenant key, client timeout/retry, changed payload conflict.
## Explicit non-goals
OAuth client-credentials provider selection, plaintext persistence, manual duplicate API contract, or customer billing.
## File ownership
Principal/API-key/developer contract modules; webhook credentials belong to YSAAS-012.
## Acceptance criteria
Secrets cannot be retrieved after creation; revoked keys fail; identical creates return original results; generated explorer derives from OpenAPI/SDK contracts.
## Validation
Focused key/auth/API/SDK compatibility tests and affected typecheck.
## Completion evidence
Credential lifecycle, redaction proof, retry examples, tests, remaining identity-provider concerns.
