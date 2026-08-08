# YSAAS-013 — Channels and publication preparation

## Objective
Implement tenant-owned channel connection state and immutable, validated publication preparation.
## Stories covered
US-030–US-032, US-034, US-036–US-037, US-057.
## Dependencies
YSAAS-001–YSAAS-004, YSAAS-006, YSAAS-007.
## Existing implementation
Publication intent/read model, scheduled timestamp, channel leases, metadata package, approval/artifact bindings, safe reconciliation read.
## Required changes
- Domain/persistence: channel identity/auth state, publishing defaults, metadata revisions, caption policy, schedule validation, publish-ready gate.
- API/SDK/BFF: OAuth connect/disconnect/reauthorize state, intent preparation, preflight, schedule/edit/cancel, post-state reads.
- Security/audit: admin/owner connection actions; tokens server-side; confirmation and immutable audit.
- Tests: OAuth tenant/nonce binding, missing horizon, provider restriction, stale revision/hash, caption/metadata requirements.
## Explicit non-goals
Provider upload, visibility mutation, token exposure, or enabling the publication flag.
## File ownership
Channel/publication-intent modules; execution is exclusively YSAAS-014.
## Acceptance criteria
Prepared intent binds exact revision/evidence/channel/metadata; publish-ready follows ADR-YSAAS-015; absent schedule configuration fails closed; OAuth never reaches browser/API responses.
## Validation
Focused publication intent, OAuth adapter contract, metadata, API tests and typecheck.
## Completion evidence
Metadata contract, gate matrix, OAuth redaction, schedule cases, tests, remaining provider restrictions.
