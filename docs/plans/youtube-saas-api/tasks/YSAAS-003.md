# YSAAS-003 — Authorization, audit, idempotency, concurrency

## Objective
Complete shared security and mutation invariants used by every later product capability.
## Stories covered
US-023, US-038–US-043, US-045, US-061, US-062.
## Dependencies
YSAAS-001.
## Existing implementation
OIDC BFF; principal directory; operation permissions; command admissions/effect records; ETags; usage/audit repository; hashed pilot keys.
## Required changes
- Domain/application: hybrid IdP/application membership, action grants, step-up hook, confirmation policy, idempotency fingerprint, conflict model, immutable audit envelope.
- Persistence: tenant-bound memberships/roles and durable replay/audit support, additive only.
- Authorization: owner/admin override boundary; no override of platform invariants.
- Tests: BOLA, revoked membership, stale ETag, replay/different fingerprint, secret redaction, competing commands.
## Explicit non-goals
Custom roles, a new authentication system, billing, automatic brief merge, or changing IdP vendors.
## File ownership
Owns shared command-security and membership modules; domain tasks own action-specific policies.
## Acceptance criteria
Server authorization remains authoritative; repeated identical mutations replay safely; changed payload conflicts; stale writes never overwrite; destructive/publishing actions require authorization and confirmation; all material actions have tenant-safe audit facts.
## Validation
Focused principal, authorization, idempotency, audit, and contract tests; affected typecheck.
## Completion evidence
Permission matrix, tenant probes, replay/conflict results, redaction evidence, risks.
