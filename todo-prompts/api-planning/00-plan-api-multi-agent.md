# Multi-Agent Planning Prompt: Production API for the Existing YouTube Platform

Act as the lead principal architect for a production-grade TypeScript media automation platform.

## Mode and safety boundary

This is a **planning-only session**.

Use multi-agent analysis where safe, but do not implement production code, refactor application code, modify schemas, install dependencies, or change deployment configuration.

You may create and update planning documentation only under:

```text
docs/api-plan/
```

You may update an existing AI content pack only with concise planning findings if the repository already defines a safe, documented mechanism for doing so. Do not invent a new AI-pack implementation in this session.

Read and follow:

```text
AGENTS.md
AGENTS.api-planning.md
```

If instructions conflict, follow the more restrictive instruction and document the conflict.

## Mission

Analyze the complete repository and produce an implementation-ready plan for building a secure, versioned API on top of the existing YouTube production application.

The API must reuse one canonical workflow and application layer shared by:

- Existing CLI commands
- The new HTTP API
- Background workers
- Scheduled processes
- Future web applications
- External customer integrations

The API must not become a parallel implementation of content generation, localization, audio, rendering, thumbnail, validation, approval, or publishing behavior.

## Product context

The repository contains or is intended to contain two major content systems.

### Dark Truth horror content

Relevant capabilities include:

- Story generation and rewriting
- Story bible and canonical facts
- Reference images
- Localization
- Narration and audio
- Full-video rendering
- Shorts
- Thumbnails
- Metadata
- Validation and repair loops
- Human approval
- Publishing and playlists

### Mathematics education content

Relevant capabilities include:

- Curriculum-driven lesson planning
- Grades 5–10 and potentially higher classes
- Multilingual lesson variants
- Narration and audio presets
- Presentation presets
- Chalkboard rendering with persistent board state
- Exercises and differentiated difficulty
- Full videos and Shorts
- Metadata, validation, approval, and publishing

Both systems must remain supported without forcing their domain-specific rules into a generic public API contract.

## Core question

Determine how the repository can evolve toward this dependency model:

```text
CLI / REST API / workers / schedulers
                  ↓
       typed application use cases
                  ↓
       canonical workflow engine
                  ↓
       domain contracts and ports
                  ↓
DB / object storage / queues / AI / TTS / renderer / YouTube
```

The plan must establish whether this is feasible from the current codebase, what must be extracted or normalized, and how to migrate without breaking the CLI.

## Multi-agent execution plan

Create non-overlapping read-only workstreams. Use up to four concurrent agents.

Recommended allocation:

### Agent A — Repository and execution paths

Investigate:

- Packages and applications
- CLI commands and scripts
- Existing HTTP APIs
- Entry points
- Story, education, audio, video, thumbnail, validation, and publishing call paths
- Duplicate or divergent implementations
- Path and filename inconsistencies

### Agent B — Workflow and infrastructure

Investigate:

- Workflow logs and state machines
- Queue and worker architecture
- Durable execution
- Retry, resume, cancellation, cache, and batch behavior
- Persistence and database models
- Filesystem and object storage
- External side-effect handling
- Duplicate YouTube publication risks

### Agent C — API, contracts, and product boundary

Investigate and design:

- REST/OpenAPI resource model
- Commands and queries
- Asynchronous job API
- Error model
- Idempotency
- Pagination
- API versioning
- Webhooks
- SDK generation
- Internal versus public operations
- Commercially useful API MVP

### Agent D — Security, tenancy, operations, and migration

Investigate and design:

- Authentication and service accounts
- API keys and OAuth/OIDC
- Authorization and approval permissions
- Tenant isolation
- Credential isolation
- Threat model
- Audit and observability
- Rate limits, quotas, and metering
- Deployment topology
- Testing strategy
- Migration roadmap and risks

Agents must write findings to separate temporary sections or files. The lead agent must reconcile contradictions and produce one coherent final plan.

## Required repository investigation

Trace at least these operations from every existing entry point:

1. Create or load an episode
2. Generate a story or lesson
3. Localize content
4. Generate narration
5. Generate visual assets
6. Render a full video
7. Render a Short
8. Generate a thumbnail
9. Validate content
10. Repair failed content
11. Approve content
12. Publish to YouTube
13. Add content to playlists
14. Execute a batch
15. Resume an interrupted workflow

For each path, record:

- Entry point
- Called application or domain services
- Direct infrastructure access
- State read and written
- File paths and naming rules
- Validation and approval behavior
- Retry and idempotency behavior
- Logging and audit behavior
- External side effects
- Whether the path is safe for API reuse

## Architecture strategies to debate

Compare and score at least:

1. API invokes CLI subprocesses
2. API directly invokes existing low-level packages
3. Shared application/workflow layer used by API and CLI
4. Separate workflow-control service

Score each on:

- Type safety
- Reliability
- Testability
- Security
- Observability
- Cancellation
- Retry and resume
- Concurrency
- Migration cost
- Operational complexity
- Long-term maintainability

Treat CLI subprocess invocation as a possible transitional adapter only, not the preferred architecture.

## Target API design

Design a REST API under `/v1` unless repository evidence strongly supports another choice.

Evaluate resources including:

- Workspace
- User
- Service account
- API key
- Project
- Brand or content profile
- Channel
- Series
- Episode
- Content source
- Story bible
- Curriculum source
- Reference asset
- Locale
- Preset
- Workflow definition
- Workflow run
- Job
- Step
- Asset
- Validation result
- Approval
- Publishing target
- Publication
- Webhook endpoint
- Usage record
- Audit event

Do not expose local filesystem paths, CLI syntax, package names, or provider-specific request structures as public API resources.

## Asynchronous contract

All long-running operations must be asynchronous.

Plan:

- `202 Accepted`
- Job and workflow-run identifiers
- Polling
- Webhooks
- Optional later SSE
- State machines
- Progress without false precision
- Approval-waiting state
- Retry state
- Cancellation
- Partial success
- Dead-letter behavior
- Cache hits
- Resume semantics

Recommend the smallest reliable first version.

## Idempotency and duplicate prevention

Define:

- `Idempotency-Key` scope and lifetime
- Request fingerprinting
- Exact replay or stored response behavior
- Key-conflict response
- Optimistic concurrency
- Workflow deduplication
- Batch item idempotency
- Provider-side request identifiers
- Crash recovery after external side effects
- Transactional outbox or equivalent where justified

Provide a precise design preventing a video from being published twice, including recovery when the process crashes after YouTube accepts the upload but before local state is committed.

## Persistence and assets

Evaluate whether existing workflow-log files can remain authoritative.

Design the target around persistent, queryable state suitable for multiple users and workers. Compare:

- Relational workflow tables
- Event history with projections
- Durable-execution framework state
- Existing JSON workflow logs
- Transitional hybrid

For assets, address:

- Local filesystem compatibility
- Object storage
- Pre-signed uploads and downloads
- Content hashes
- Immutability
- MIME and size validation
- Temporary files
- Cleanup and retention
- Cross-tenant isolation
- Large video delivery

## Authentication, authorization, and tenancy

Evaluate:

- Existing Keycloak/OIDC integration
- OAuth client credentials
- Scoped API keys
- Service accounts
- Human access tokens

Define permissions for:

- Workspace administration
- Content creation
- Rendering
- Validation
- Approval
- Publishing
- Channel credentials
- Webhooks
- Audit access
- Usage access

Publishing credentials and generated assets must be tenant-isolated.

## Security threat model

At minimum cover:

- Broken object-level authorization
- Cross-tenant asset access
- Path traversal
- Shell injection
- Unsafe CLI subprocess bridging
- SSRF through external assets
- Malicious uploads
- Prompt injection through content sources
- Secret leakage
- YouTube credential leakage
- Webhook forgery and replay
- Resource exhaustion
- Render-worker denial of service
- Duplicate publishing
- Log injection
- Sensitive prompt or telemetry data

## Observability and audit

Design:

- Request, correlation, causation, workflow, job, and step IDs
- Structured logs
- Distributed traces
- Queue and worker metrics
- Render and provider latency
- Retry and failure metrics
- Cache-hit rates
- Cost and token usage
- Publication success and failure
- Webhook delivery health
- Stuck-workflow detection

Operational logs and immutable audit events must be separate concepts.

## API MVP

Define the smallest externally useful API.

Prefer a small number of complete high-level workflows over exposing every low-level internal step.

Separate:

- API MVP
- External pilot requirements
- General availability requirements
- Later features
- Explicit non-goals

Consider starting with:

- Create project/channel configuration
- Create episode from structured input
- Start one canonical content workflow
- Poll workflow status
- Retrieve generated assets
- Approve a gated workflow
- Publish or schedule approved content
- Receive signed webhook events

Challenge this scope using repository evidence and target-customer value.

## Required outputs

Create or update:

```text
docs/api-plan/
  README.md
  01-current-architecture.md
  02-execution-path-analysis.md
  03-duplication-and-divergence.md
  04-strategy-comparison.md
  05-target-architecture.md
  06-api-resource-model.md
  07-api-contract-v1.md
  08-job-and-workflow-model.md
  09-idempotency-and-concurrency.md
  10-persistence-and-assets.md
  11-auth-authorization-tenancy.md
  12-security-threat-model.md
  13-events-and-webhooks.md
  14-observability-and-audit.md
  15-rate-limits-quotas-metering.md
  16-testing-strategy.md
  17-deployment-topology.md
  18-migration-roadmap.md
  19-api-mvp.md
  20-decision-register.md
  21-risk-register.md
  22-implementation-backlog.md
  PLAN-STATUS.md
  decisions/
    ADR-API-001-shared-application-layer.md
    ADR-API-002-rest-openapi.md
    ADR-API-003-asynchronous-workflows.md
    ADR-API-004-workflow-persistence.md
    ADR-API-005-authentication-and-tenancy.md
  diagrams/
    current-context.mmd
    execution-paths.mmd
    target-context.mmd
    target-components.mmd
    workflow-sequence.mmd
    publishing-idempotency-sequence.mmd
    deployment-topology.mmd
```

Use repository naming conventions when they are already established, but preserve equivalent deliverables.

## PLAN-STATUS requirements

`PLAN-STATUS.md` must contain:

- Overall status
- Agents and workstreams used
- Completed analyses
- Incomplete analyses
- Verified findings
- Unresolved questions
- Decisions requiring operator approval
- Documents produced
- Validation commands executed
- Recommended next prompt

This file is the resume point for interrupted Codex sessions.

## Decision register requirements

Each decision must include:

- Decision ID
- Question
- Options
- Repository evidence
- Advantages and disadvantages
- Security impact
- Operational impact
- Migration impact
- Recommendation
- Confidence
- Operator approval required
- Conditions that would change the recommendation

At minimum debate:

- REST versus tRPC versus GraphQL
- Modular monolith versus separate services
- Current queue versus durable execution
- Relational workflow state versus event sourcing
- Polling versus webhooks versus SSE
- API key versus OAuth client credentials
- Local filesystem bridge versus object storage migration
- Shared database versus stronger tenant isolation
- High-level workflow endpoints versus low-level step endpoints
- Metering first versus immediate billing

## Risk register requirements

For each risk include:

- Risk ID
- Description
- Evidence
- Likelihood
- Impact
- Detection
- Mitigation
- Contingency
- Owner role
- Blocking phase

Prioritize duplicate implementations, duplicate publishing, unsafe subprocess execution, state inconsistency, cross-tenant leaks, credential leakage, and non-resumable jobs.

## Implementation backlog requirements

Create small, independently reviewable work packages with:

- ID
- Objective
- Scope
- Out of scope
- Affected packages
- Dependencies
- Migration behavior
- Tests
- Acceptance criteria
- Rollback
- Risks
- Parallel-safety classification
- Recommended model and reasoning effort

Group them into:

1. Characterization tests and inventory
2. Shared application-layer extraction
3. Workflow-state normalization
4. CLI migration
5. Internal API
6. Worker and queue hardening
7. Authentication and tenant boundaries
8. External API contract
9. Webhooks and metering
10. Pilot hardening
11. General availability hardening

Mark the critical path.

## Evidence rules

For every material finding, distinguish:

- **Verified**
- **Inferred**
- **Recommended**
- **Unresolved**

Verified statements must cite concrete repository paths, symbols, tests, schemas, or commands.

Do not claim that a feature exists merely because documentation says it should exist.

## Completion response

When the plan is complete, report:

1. Recommended target architecture
2. Five highest current risks
3. Recommended API MVP
4. Critical migration path
5. First implementation work package
6. Decisions requiring operator approval
7. Files created or changed
8. Validation commands executed
9. Unverified repository areas
10. Exact next prompt to run

Do not begin implementation.
