# YSAAS-015 — Clone, templates, shared reuse

## Objective
Add safe content/configuration reuse without copying production identity or violating asset policy.
## Stories covered
US-048–US-050.
## Dependencies
YSAAS-001–YSAAS-004, YSAAS-006.
## Existing implementation
Episode creation/revisions, profile configs/overrides, reference manifests, artifact hashes/cache and source-rights policies.
## Required changes
- Domain/persistence: clone policy, template/version entity, application snapshot, asset ownership/reference graph, copy-on-write rules.
- API/SDK/BFF: clone/template CRUD/apply and eligible asset search/attach.
- Authorization/audit: source/target authorization, sharing/right decision, source/target audit.
- Tests: no runtime/review/publication identity copy, pinned config stability, prohibited/shared/revoked asset.
## Explicit non-goals
Cross-tenant marketplace, implicit localization, workflow start, or modifying shared content in place.
## File ownership
Template/reuse modules; artifact identity and invalidation stay in YSAAS-006.
## Acceptance criteria
Clones have new identity and blank runtime state; template changes do not alter pinned revisions; asset reuse references immutable content/provenance and respects ownership.
## Validation
Focused clone/template/reuse tests and affected typecheck.
## Completion evidence
Copy/reset matrix, ownership cases, tests, compatibility risks.
