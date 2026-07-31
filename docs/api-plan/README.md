# YouTube Platform API Architecture Plan

## Recommendation

Build a shared, typed application layer around the existing generic workflow engine. CLI, REST, workers, and schedulers must be adapters to that layer. Begin as a modular monolith with separate process roles, relational workflow/job authority, append-only events/outbox, and an asset port. Preserve the local filesystem as an internal compatibility bridge; require object storage and tenant isolation before external pilot.

The plan is implementation-ready but **Proposed**: operator decisions in the decision register and ADRs remain open. Do not expose the current `apps/api` server or publication path externally.

## Read in this order

1. [Current architecture](01-current-architecture.md) and [execution paths](02-execution-path-analysis.md)
2. [Duplication](03-duplication-and-divergence.md) and [strategy](04-strategy-comparison.md)
3. [Target architecture](05-target-architecture.md), [API model](06-api-resource-model.md), and [v1 contract](07-api-contract-v1.md)
4. [Workflow](08-job-and-workflow-model.md), [idempotency](09-idempotency-and-concurrency.md), and [persistence/assets](10-persistence-and-assets.md)
5. [Auth/tenancy](11-auth-authorization-tenancy.md) through [deployment](17-deployment-topology.md)
6. [Migration](18-migration-roadmap.md), [MVP](19-api-mvp.md), [decisions](20-decision-register.md), [risks](21-risk-register.md), and [backlog](22-implementation-backlog.md)
7. [Implementation tasks](tasks/README.md) for the dependency-ordered execution packages
8. [PLAN-STATUS](PLAN-STATUS.md) for the resume point

## Decision records

- [ADR-API-001](decisions/ADR-API-001-shared-application-layer.md) — shared application layer
- [ADR-API-002](decisions/ADR-API-002-rest-openapi.md) — REST/OpenAPI
- [ADR-API-003](decisions/ADR-API-003-asynchronous-workflows.md) — asynchronous workflows
- [ADR-API-004](decisions/ADR-API-004-workflow-persistence.md) — relational workflow authority
- [ADR-API-005](decisions/ADR-API-005-authentication-and-tenancy.md) — authentication/tenancy

## Evidence convention

Material current-state claims are marked **Verified** or **Inferred**; target choices are **Recommended**; gaps are **Unresolved**. Detailed parallel evidence is retained under `workstreams/`.

## Validation

```bash
./scripts/validate-api-plan.sh
git diff --check -- docs/api-plan
pnpm exec prettier --check "docs/api-plan/**/*.md"
```

These validate presence and formatting, not production behavior. Mermaid source is covered by required-file and Git integrity checks. No production code, schema, dependency, or deployment change is part of this plan.
