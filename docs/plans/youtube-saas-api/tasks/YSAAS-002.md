# YSAAS-002 — Capability and configuration registry

## Objective
Provide one typed, versioned source for capability admission and resolved production configuration.
## Stories covered
US-003, US-004, US-013, US-016–US-019, US-024, US-056.
## Dependencies
YSAAS-001.
## Existing implementation
`packages/domain/src/workflow-contracts.ts`; content-policy contracts; workflow-admission composition; speech profile resolution; pilot UI mappings.
## Required changes
- Domain/config: implement platform/tenant-channel/genre/episode precedence, field provenance, allowed tenant settings, entitlement and typed rejection reasons.
- API/BFF/SDK: domain contract only; domain-owned public module is exposed by later UI tasks.
- Authorization/audit: restrict platform invariants and audit tenant configuration changes.
- Tests: resolution precedence, capability version races, unsupported combinations, pinned configuration stability.
## Explicit non-goals
Provider credentials, provider-specific fallback logic, profile-specific workflow execution, or a second profile registry.
## File ownership
Owns capability/config modules; YSAAS-001 owns revision types and YSAAS-010 owns runtime health/usage.
## Acceptance criteria
Workflow admission and frontend choices consume the same versioned result; unsupported profile × locale × voice × render × entitlement returns typed reasons; later default changes do not alter pinned revisions.
## Validation
Focused capability/configuration tests and package typecheck.
## Completion evidence
Supported cells, rejection codes, precedence fixtures, tests, compatibility risks.
