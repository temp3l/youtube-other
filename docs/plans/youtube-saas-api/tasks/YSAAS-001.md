# YSAAS-001 — Production revision and state

## Objective
Create authoritative immutable `ProductionRevision` identity and a backend-owned `EpisodeProductionState` projection.
## Stories covered
US-006, US-011, US-017, US-028, US-032, US-061, US-062.
## Dependencies
None.
## Existing implementation
`packages/persistence/src/relational-workflow-state.ts`; `packages/domain/src/workflow-contracts.ts`; `apps/api/src/postgres-api-use-cases.ts`.
## Required changes
- Domain: add revision identity, resolved-config fingerprint, lifecycle/gate/action types per ADR-YSAAS-001/015.
- Persistence: additive revision/projection support and modular migration registration.
- API/BFF/SDK: none; YSAAS-004/017 expose it.
- Authorization/audit: projection queries are workspace/project scoped.
- Tests: transitions, immutability, fragmented-state projection, stale inputs.
## Explicit non-goals
Workflow execution, UI, final endpoint design, or migrating historical filesystem assets.
## File ownership
Sole owner of production-state types and migration registry. Conflicts with any task editing those surfaces.
## Acceptance criteria
Given one episode with multiple runs and revisions, the projection identifies the authoritative current revision and independently represents workflow, validation, review, render, localization, publication, blockers, warnings, and actions without filenames or UI mappings.
## Validation
Focused domain and persistence tests; affected package typecheck.
## Completion evidence
Changed paths, schema compatibility, focused results, migration/rollback risks, and unresolved legacy-state cases.
