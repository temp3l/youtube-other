# YSAAS-004 — Modular contract and runtime seams

## Objective
Create disjoint extension seams for the large API contract, SDK registry, BFF gateway, web pages, and migration composition.
## Stories covered
US-042, US-047, US-059, US-062.
## Dependencies
None.
## Existing implementation
`apps/api/src/contract.ts`; `packages/api-sdk/src/v1-contract.ts`; `apps/web/src/saas-runtime.ts`; `apps/web/src/saas-api-bff.ts`.
## Required changes
- Extract behavior-preserving domain route/schema, SDK-operation, gateway, and page modules with explicit registries.
- Pre-register ownership slots for workflow, artifact, review, localization, operations, developer, publishing, and lifecycle work.
- Preserve operation IDs, wire shapes, generated OpenAPI, CSP/session behavior, and existing tests.
- Add contract composition and parity tests.
## Explicit non-goals
New endpoints, UI behavior, schema semantics, styling redesign, or migration behavior.
## File ownership
Sole owner of central registries and legacy monolith extraction. Later tasks edit only assigned modules.
## Acceptance criteria
Generated OpenAPI/SDK and current web routes are byte/semantically compatible as applicable; existing focused tests pass; later domain modules can be added without editing the same canonical registry file.
## Validation
Existing contract/SDK compatibility test, web runtime focused test, affected typechecks.
## Completion evidence
Module ownership map, parity results, changed paths, remaining coupling.
