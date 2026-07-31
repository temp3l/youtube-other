# Decision Register

## API-DEC-001 — Public protocol

- **Question:** REST/OpenAPI, tRPC, or GraphQL?
- **Options:** REST/OpenAPI (language-neutral async resources); tRPC (fast TypeScript DX, tight coupling); GraphQL (flexible reads, auth/cost complexity).
- **Repository evidence:** `apps/api` has no contract; integrations are asynchronous and not TypeScript-only.
- **Security / operations / migration impact:** REST has mature gateway semantics and explicit schemas; requires contract tooling but maps incrementally to use cases.
- **Recommendation / confidence:** REST `/v1` + OpenAPI 3.1; **High**.
- **Status:** Board accepted.
- **Change condition:** dominant TS-only private use or mature catalog analytics may add, not replace, tRPC/GraphQL.

## API-DEC-002 — Deployment boundary

- **Question:** modular monolith or separate services?
- **Options:** modular monolith process roles (low migration/ops cost); workflow-control service now (failure isolation, high distributed complexity).
- **Repository evidence:** state/assets/composition are local and CLI-owned; generic workflow interfaces are reusable.
- **Security / operations / migration impact:** separate worker identities are needed, but a service split would not yet remove local coupling.
- **Recommendation / confidence:** one codebase, API/scheduler/worker/render/publish roles; **High**.
- **Status:** Board accepted.
- **Change condition:** measured scaling, ownership, region, or compliance isolation after network-safe ports.

## API-DEC-003 — Application boundary

- **Question:** subprocess, direct packages, or shared use cases?
- **Options:** subprocess is cheap/unsafe; direct packages duplicate orchestration; shared use cases maximize parity; later control service preserves same model.
- **Repository evidence:** nested CLI wrappers exist; math canonical bindings prove callable workflow reuse; Dark Truth remains unbound.
- **Security / operations / migration impact:** one layer centralizes auth, idempotency, effects, logs; requires characterization/task binding.
- **Recommendation / confidence:** shared typed application/workflow layer; **High**.
- **Status:** Board accepted.
- **Change condition:** none for logical boundary; only deployment may change.

## API-DEC-004 — Queue and durable execution

- **Question:** current file/batch queues, database jobs, broker, or durable framework?
- **Options:** current files lack multi-writer safety; DB jobs are smallest reliable; broker improves throughput; durable framework handles timers/fan-out but adds dependency.
- **Repository evidence:** no queue/framework dependency; batch/provider orphan windows and file locks exist.
- **Security / operations / migration impact:** DB jobs keep tenant transaction/outbox atomic and operations small; broker/framework need extra recovery semantics.
- **Recommendation / confidence:** PostgreSQL job table with fenced leases first; **Medium-high**.
- **Status:** Board accepted.
- **Change condition:** measured DB contention or long-timer/fan-out demand.

## API-DEC-005 — Workflow state model

- **Question:** relational state, event sourcing, durable-framework state, JSON, or hybrid?
- **Options:** JSON is useful compatibility only; relational is queryable; full event sourcing is complex; framework state is insufficient for business authority; relational + append history balances both.
- **Repository evidence:** generic JSONL events/projection plus multiple specialized stores; SQLite only episodes.
- **Security / operations / migration impact:** SQL enables tenant constraints/CAS/outbox; import/projection avoids big bang.
- **Recommendation / confidence:** relational current state + append-only workflow events + JSON bridge; **High**.
- **Status:** Board accepted.
- **Change condition:** offline-only product or proven event-sourced organizational standard.

## API-DEC-006 — Completion delivery

- **Question:** polling, webhooks, or SSE?
- **Options:** polling is reliable baseline; webhooks aid integrations but are at-least-once; SSE is interactive and connection-heavy.
- **Repository evidence:** none currently exists; job states naturally support polling.
- **Security / operations / migration impact:** webhooks require SSRF/signing/replay/delivery store; SSE requires gateway budgets/replay.
- **Recommendation / confidence:** polling MVP, signed webhooks pilot, SSE later; **High**.
- **Status:** Board accepted.
- **Change condition:** first-party real-time demand with proven event replay infrastructure.

## API-DEC-007 — Machine authentication

- **Question:** scoped API keys or OAuth client credentials?
- **Options:** keys are simple but lifecycle-heavy; client credentials give centralized identity/scopes but require IdP integration.
- **Repository evidence:** neither exists; Google OAuth is provider-only.
- **Security / operations / migration impact:** OAuth preferred for durable integrations; hashed expiring scoped keys lower pilot friction.
- **Recommendation / confidence:** support OAuth service accounts; optionally pilot keys; **Medium**.
- **Status:** Board accepted.
- **Change condition:** enterprise IdP capabilities/customer expectations or policy prohibition on long-lived keys.

## API-DEC-008 — Asset migration

- **Question:** filesystem bridge or immediate object storage?
- **Options:** local bridge preserves CLI/internal MVP; immediate object storage reduces later work but expands critical path.
- **Repository evidence:** all production artifacts are filesystem-based; strong hash/path containment exists; no object-store adapter.
- **Security / operations / migration impact:** external multi-tenant delivery cannot expose shared local paths; bridge is safe only single-host/scoped.
- **Recommendation / confidence:** bridge for internal MVP; object storage mandatory before external pilot; **High**.
- **Status:** Board accepted.
- **Change condition:** external pilot is the first release, making object storage immediate.

## API-DEC-009 — Tenant data isolation

- **Question:** shared database, schema/database per tenant, or hybrid tiers?
- **Options:** shared rows/composite keys are simplest; RLS/schema/DB improve defense/isolation at operational cost.
- **Repository evidence:** no tenant model; current SQLite/path state is globally local.
- **Security / operations / migration impact:** shared DB demands exhaustive scoped repositories/tests; stronger tiers complicate migrations/backups/pooling.
- **Recommendation / confidence:** shared DB with workspace composite keys and optional RLS defense; **Medium**.
- **Status:** Board accepted.
- **Change condition:** residency, enterprise contracts, blast-radius, or regulatory controls.

## API-DEC-010 — Public workflow granularity

- **Question:** high-level workflow endpoints or low-level steps?
- **Options:** high-level commands preserve canonical policy; low-level steps offer flexibility but expose internals and bypass gates.
- **Repository evidence:** current task IDs/implementations vary and Dark Truth is incomplete; domain profiles already distinguish behavior.
- **Security / operations / migration impact:** high-level surface simplifies auth/quota/versioning; internal steps remain worker-only.
- **Recommendation / confidence:** high-level `episode-production`, separate approval/publication; **High**.
- **Status:** Board accepted.
- **Change condition:** future vetted customer-authored workflow product with policy-safe compiler.

## API-DEC-011 — Metering and billing

- **Question:** metering first or immediate billing?
- **Options:** metering validates units/costs; billing immediately monetizes but risks inaccurate charges.
- **Repository evidence:** estimated provider cost/token telemetry exists but is file-based and sometimes estimated.
- **Security / operations / migration impact:** append-only usage with corrections is required before invoice authority.
- **Recommendation / confidence:** metering/reservations/quotas first; billing later; **High**.
- **Status:** Board accepted.
- **Change condition:** externally supplied authoritative provider costs and approved commercial unit/refund policy.

## API-DEC-012 — Duplicate-publication recovery

- **Question:** retry uncertain uploads, reconcile automatically, or stop for operator?
- **Options:** blind retry favors availability and risks duplicates; session/marker reconciliation can recover evidence; fail-closed avoids duplicate when ambiguous.
- **Repository evidence:** current checkpoint is after `videos.insert` returns; no persisted session or provider idempotency token.
- **Security / operations / migration impact:** effect journal/channel lease/operator tooling adds work but is mandatory for trustworthy publishing.
- **Recommendation / confidence:** reconcile exact provider evidence; otherwise `reconciliation_required`, never blind retry; **High**.
- **Status:** Blocked on evidence. Production publication is blocked until Task 02 proves a recoverable YouTube protocol path; the fail-closed reconciliation rule is accepted now.
- **Change condition:** a proven provider exactly-once/idempotency guarantee with durable client key/session recovery.

# Operator Decisions

- **Status:** Board accepted
- **Decision date:** 2026-07-31
- **Scope:** API planning and phased implementation
- **General constraint:** The API, CLI, workers, and scheduled jobs must use one canonical typed application and workflow layer. No parallel orchestration implementation may be introduced.

## API-DEC-001 — Public protocol

**Decision: APPROVED**

Use REST under `/v1` with OpenAPI 3.1 as the public API contract.

Additional requirements:

- The contract must be language-neutral.
- Long-running operations return asynchronous job or workflow resources.
- tRPC may later be used by a first-party TypeScript frontend, but it must call the same application layer and must not replace or diverge from the public REST contract.
- GraphQL is not part of the initial API scope.
- Public schemas must not expose internal package names, CLI commands, filesystem paths, or provider-specific DTOs.

## API-DEC-002 — Deployment boundary

**Decision: APPROVED**

Use a modular monolith codebase with independently runnable process roles:

- API
- Scheduler
- General worker
- Render worker
- Publishing worker

These roles may initially run on one host but must have explicit boundaries and separate entry points.

Do not introduce independent network services until required by measured scaling, security isolation, regional deployment, team ownership, or operational constraints.

The logical module boundaries must not depend on whether the modules run in one process or several services.

## API-DEC-003 — Application boundary

**Decision: APPROVED**

Create one shared, typed application and workflow layer.

The following components must be thin adapters:

- HTTP controllers
- CLI commands
- Workers
- Scheduled jobs
- Codex-assisted operations
- Future web applications

The API must not:

- Invoke CLI commands through subprocesses as its normal execution path
- Duplicate workflow orchestration
- Call low-level providers directly
- Bypass validation, approval, audit, idempotency, or caching policies

CLI subprocess execution may only exist as a temporary, explicitly documented migration adapter with a removal plan.

## API-DEC-004 — Queue and durable execution

**Decision: APPROVED**

Use PostgreSQL-backed jobs as the first authoritative queue and execution-control mechanism.

The implementation must include:

- Fenced leases
- Worker heartbeats
- Lease expiry and recovery
- Optimistic concurrency
- Atomic job creation with an outbox where external delivery is involved
- Retry policies
- Dead-letter or terminal-failure state
- Cancellation state
- Worker identity
- Tenant context
- Correlation and causation IDs

RabbitMQ or a durable-execution framework may be added later when measured throughput, long-running timers, large fan-out, or operational evidence justifies it.

The public workflow contract must remain stable if the internal execution mechanism changes.

## API-DEC-005 — Workflow state model

**Decision: APPROVED**

Use:

1. Relational current-state tables
2. Append-only workflow and step events
3. A temporary JSON compatibility bridge for existing CLI workflow logs

PostgreSQL is the authoritative state store for API-managed workflows.

Local JSON or JSONL workflow files must not be authoritative for multi-user or multi-tenant execution.

Each workflow run must retain:

- Input snapshot
- Configuration version
- Prompt version
- Model and provider selection
- Renderer version
- Preset version
- Code or build version where available
- Asset hashes
- Step history
- Retry history
- Approval history
- External side-effect references
- Current valid next actions

Full event sourcing is not required.

## API-DEC-006 — Completion delivery

**Decision: APPROVED**

Use:

- Polling as the initial reliable baseline
- Signed webhooks before the first external pilot
- SSE only when a first-party UI demonstrates a real requirement

Webhooks must provide:

- HMAC signing
- Timestamp verification
- Delivery IDs
- Replay protection
- At-least-once delivery
- Retry with backoff
- Delivery history
- Endpoint disabling
- Secret rotation

Webhook consumers must be instructed to process events idempotently.

## API-DEC-007 — Machine authentication

**Decision: APPROVED WITH AMENDMENT**

Use OIDC/OAuth 2.0 as the primary authentication architecture.

Preferred implementation:

- Keycloak or the repository's approved OIDC provider
- Authorization Code flow with PKCE for human users
- Client Credentials flow for service accounts
- Scoped, hashed API keys for pilot integrations where OAuth creates excessive onboarding friction

Pilot API keys must:

- Be workspace-scoped
- Have explicit permissions
- Be shown only once
- Be hashed at rest
- Support rotation and immediate revocation
- Have an expiry date
- Have last-used metadata
- Never contain provider credentials

Default pilot API-key validity should not exceed 90 days without explicit renewal.

Long-term enterprise integrations should use OAuth client credentials.

## API-DEC-008 — Asset migration

**Decision: APPROVED WITH AMENDMENT**

A filesystem compatibility bridge may be used for local development and internal migration.

Object storage is mandatory before the first external multi-tenant pilot.

Use an asset-storage port so that the implementation can support:

- Local filesystem during development
- MinIO for local or self-hosted environments
- Azure Blob Storage or another approved object store in production

The API must exchange asset IDs and short-lived signed URLs rather than local filesystem paths.

All assets must have:

- Workspace ownership
- MIME validation
- Size limits
- Content hashes
- Immutable generated-asset identity
- Safe filenames
- Retention metadata
- Access-control checks
- Cleanup state

No shared local directory may be directly exposed to external customers.

## API-DEC-009 — Tenant data isolation

**Decision: APPROVED WITH AMENDMENT**

Use a shared PostgreSQL database for the initial product, with mandatory workspace isolation.

Required controls:

- `workspace_id` on every tenant-owned aggregate
- Composite unique constraints including `workspace_id`
- Repository-level tenant scoping
- PostgreSQL row-level security as defense in depth
- Tenant context in jobs, events, caches, logs, metrics, and asset keys
- Automated cross-tenant isolation tests
- No API method that loads a tenant-owned object by global ID without verifying workspace ownership

Schema-per-tenant or database-per-tenant may later be offered where contracts, residency, compliance, or blast-radius requirements justify the operational cost.

## API-DEC-010 — Public workflow granularity

**Decision: APPROVED**

Expose high-level, policy-controlled workflows.

Initial public commands should include concepts such as:

- Create episode
- Start episode production
- Validate episode
- Approve or reject episode
- Publish or schedule publication
- Retry or resume workflow
- Cancel workflow

Do not expose arbitrary internal step execution to external customers.

Internal workers may execute low-level steps, but customers must not be able to bypass:

- Required validation
- Approval gates
- Content policies
- Quotas
- Audit recording
- Publication safeguards

A future customer-authored workflow product requires a separate policy-safe workflow compiler and is out of scope for the initial API.

## API-DEC-011 — Metering and billing

**Decision: APPROVED**

Implement authoritative usage metering, quotas, reservations, and cost attribution before automated billing.

Initial metering dimensions should include:

- AI input and output tokens
- Provider cost
- Narration minutes
- Rendered video minutes
- Render compute time
- Storage in GB-days
- Active workflow concurrency
- Published videos
- Locales generated
- Batch size

Usage records must be append-only, support corrections through compensating entries, and retain links to the originating workflow and workspace.

Automated invoicing must not be implemented until:

- Metering accuracy is verified
- Commercial units are approved
- Refund and failure policies are defined
- Provider-cost reconciliation is reliable

## API-DEC-012 — Duplicate-publication recovery

**Decision: APPROVED**

Publishing must fail closed when the result of a YouTube upload is ambiguous.

The system must:

- Acquire a channel-scoped publishing lease
- Persist a publication intent before invoking YouTube
- Record request fingerprints and asset hashes
- Persist upload-session or provider identifiers where available
- Record the external video ID before marking the step complete
- Reconcile using exact provider evidence after uncertain outcomes
- Transition to `reconciliation_required` when the result cannot be proven
- Never blindly retry an ambiguous upload

Only an explicit operator reconciliation action may resolve an uncertain publication when exact automatic reconciliation is impossible.

# Additional Operator Decisions

## Database

**Decision:** PostgreSQL is the authoritative database for the API, workflow state, jobs, idempotency records, usage records, webhook deliveries, approvals, and audit metadata.

SQLite and filesystem state may remain supported for isolated local development and legacy migration only.

## Offline CLI policy

**Decision:** Preserve the CLI, but make it a thin adapter over the same application layer as the API.

Two execution profiles may exist:

### Connected mode

- Uses PostgreSQL and the configured object store
- Produces the same authoritative workflow records as the API
- Suitable for production and resumable operations

### Local development mode

- May use local filesystem and lightweight persistence adapters
- Must be explicitly marked non-multi-tenant
- Must not silently diverge in business rules
- Must not be used as the source of truth for externally managed workflows

## Identity provider and API-key policy

**Decision:** Use Keycloak or the approved OIDC provider for human and service identities.

Allow scoped pilot API keys as a transitional integration mechanism.

API keys must not become the only long-term machine-authentication mechanism.

## Tenant-isolation tier

**Decision:** Shared PostgreSQL with mandatory workspace scoping and enabled row-level security for tenant-owned tables.

Use schema-per-tenant or database-per-tenant only for future contractual or regulatory tiers.

## First external pilot profile

**Decision:** Target a small professional educational-content creator or media team.

Recommended pilot constraints:

- One workspace
- One to three YouTube channels
- Two to five users
- Approximately 10–50 produced videos per month
- Human approval required before publication
- Standard supported workflow presets
- No customer-authored workflows
- No arbitrary low-level step execution
- Controlled locale and provider selection
- Explicit monthly cost and concurrency limits

The educational workflow should be the first externally exposed profile because it has clearer production rules, repeatability, and measurable output.

Dark Truth may remain an internal or later pilot workflow until its canonical application path and all story-bible and reference-image requirements are fully enforced.

## Canonical Dark Truth path

**Decision:** Dark Truth must use the same shared application and workflow layer as every other production profile.

Its workflow must explicitly preserve:

- Story bible
- Reference images
- Canonical facts
- Episode continuity
- Localization constraints
- Horror-specific validators
- Thumbnail requirements
- Approval gates
- Publication policy

No Dark Truth script, CLI command, or Codex workflow may bypass the canonical workflow engine.

## YouTube credential ownership

**Decision:** YouTube credentials belong to a specific workspace and channel connection.

Credentials must:

- Be encrypted at rest
- Be inaccessible through normal API responses
- Be isolated by workspace
- Support revocation and rotation
- Have access audited
- Never be reused globally across unrelated tenants

## Publication visibility policy

**Decision:** Default to private-first publishing.

The initial publication workflow should:

1. Upload as `private`
2. Verify the returned YouTube video ID
3. Run post-upload validation
4. Require an explicit approval or approved scheduling policy
5. Change visibility or schedule publication only after validation

Direct public publication requires an explicitly configured workspace policy and sufficient authorization.

## Idempotency retention

**Decision:** Retain completed idempotency records for 30 days by default.

Longer retention may be configured for publication and billing-sensitive commands.

The same idempotency key reused with a different request fingerprint must return an idempotency conflict.

## Workflow-event and audit retention

**Decision:**

- Workflow execution events: minimum 365 days
- Security and administrative audit events: minimum 365 days
- Publication and billing-relevant events: retained according to commercial, legal, and tax requirements
- Retention must be configurable by workspace policy where required

Audit records must be logically immutable.

## Asset retention

**Decision:** Use differentiated retention.

Default pilot policy:

- Temporary upload and render scratch files: 7 days
- Intermediate generated assets: 30 days
- Unpublished final assets: 90 days
- Published master assets and provenance: retained until workspace deletion or explicit lifecycle policy
- Failed or quarantined uploads: 30 days unless security investigation requires longer retention

Deletion must remove both object data and searchable metadata according to the configured lifecycle policy, except where audit or legal retention applies.

## Data region

**Decision:** Store production customer data in an EU region.

No customer assets, prompts, credentials, workflow state, or backups may be moved outside approved regions without an explicit provider and data-processing decision.

## Backup and disaster recovery objectives

**Pilot targets:**

- Point-in-time recovery for PostgreSQL
- Encrypted backups
- Tested restore procedure
- RPO of one hour or better
- RTO of eight hours or better

**General-availability target:**

- RPO of 15 minutes or better
- RTO of four hours or better
- Periodic restore tests
- Documented dependency and object-storage recovery

These are service objectives, not contractual guarantees, until validated operationally.

## Commercial quotas

**Decision:** Implement workspace-level and API-key-level quotas before the external pilot.

Initial controls must include:

- Maximum concurrent workflows
- Maximum batch size
- Monthly AI-spend ceiling
- Maximum narration minutes
- Maximum render minutes
- Maximum storage
- Maximum publication count
- Per-provider concurrency
- Global emergency safety limits

Use:

- Warning notifications at 80% of a quota
- Soft limits where operations can safely continue
- Hard limits for cost exposure, concurrency, storage exhaustion, and publishing
- Explicit administrative override with audit logging

## Billing policy

**Decision:** Do not automatically invoice during the first technical pilot.

Record authoritative usage and provide a usage report.

Introduce billing only after cost units, failed-job treatment, retries, credits, refunds, and publication charges are commercially approved.

## Cross-cutting implementation contracts

These decisions are authoritative for all implementation tasks. They resolve wording differences in the planning documents; an implementation must not infer a weaker rule from a legacy adapter.

### Immutable runs and upgrades

- **Status:** Board accepted.
- A run receives an immutable execution specification at admission: normalized input and content revision, configuration/prompt/model/provider/renderer/preset/build versions, asset hashes, policy version, and resolved task graph.
- Resume repeats the same execution specification. A material input, configuration, or policy change creates a linked successor run with `supersedes_run_id`; it never mutates or silently upgrades the original run.
- Historical runs, events, attempts, approvals, and effect references are immutable. Compatibility projections may be regenerated but are never an authority.

### Effects, cancellation, revocation, and publication

- **Status:** Board accepted, with production publishing blocked on recovery evidence.
- An external effect has one durable identity and transitions through `prepared`, `in_flight`, `succeeded`, `failed`, `outcome_uncertain`, or `reconciled`. `outcome_uncertain` is not retryable without exact recovery evidence.
- Cancellation is cooperative before an irreversible effect begins. Once an effect is in flight, cancellation records the request and requires reconciliation rather than claiming it cancelled the provider outcome.
- Approval revocation blocks queued work and any later mutable publication action. It cannot retract an already accepted provider effect; a visibility change, takedown, or operator reconciliation is a separately audited compensating command.
- A publication intent is immutable. Credentials, approvals, policy, artifact hashes, schedule, locale, and target are rechecked at effect execution; any material change requires a new intent and approval.

### Public error, webhook, and idempotency contracts

- **Status:** Board accepted.
- Public failures use RFC 9457 Problem Details with stable machine `code`, `requestId`, `retryable`, and field errors. API clients must depend on the code, not a provider message or internal exception type.
- Webhook events use the versioned envelope in `13-events-and-webhooks.md`, including `id`, `type`, `version`, `occurred_at`, `workspace_id`, `subject`, `subject_version`, `correlation_id`, `causation_id`, and bounded public `data`. Deliveries are HMAC-signed, at-least-once, and can be reordered.
- Idempotency is scoped by workspace, principal, method, and normalized route. The same key and fingerprint replays the original admitted command; a different fingerprint is a conflict. The default completed-record retention is 30 days, with longer configured retention for publication and billing-sensitive commands.

### Pilot capability and operational gates

| Capability                                                     | Internal development                           | External pilot                                                   | General availability                                    |
| -------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Education production, human approval, private-first publish    | Allowed after task-specific tests              | Allowed only after Tasks 07 and 11–15 pass                       | Allowed only after Task 16 evidence passes              |
| Dark Truth production                                          | Internal only until Task 06 parity is proven   | Not entitled by default                                          | Requires Task 16 parity evidence                        |
| Public API, OIDC/tenant access, signed webhooks, object assets | No external claim                              | Requires Tasks 11–14                                             | Requires Task 16 acceptance                             |
| YouTube visibility/publication mutation                        | Legacy/internal only; fail closed on ambiguity | Requires Task 15 recovery proof and operator reconciliation path | Requires Task 16 reconciliation and operations evidence |

The pilot is limited to the accepted education profile, controlled workspaces/channels/providers, human approval, and the approved quota policy. Production deployment also requires EU-region data handling, encrypted backups with tested restore, and the stated RPO/RTO objectives; these remain evidence gates, not claims of completed operations.

# ADR Approval

Approve the ADRs corresponding to:

- REST/OpenAPI public protocol
- Modular monolith with process roles
- Shared typed application layer
- PostgreSQL-backed asynchronous jobs
- Relational workflow state with append-only events

Any ADR that materially contradicts the decisions above must remain proposed until reconciled.

# Implementation Gate

Planning may continue immediately.

Implementation may begin only when:

1. The decision register has been updated with these operator decisions.
2. The ADRs match the approved decisions.
3. The migration backlog identifies the shared application-layer extraction as the first architectural workstream.
4. The first implementation phase contains characterization and parity tests.
5. No API controller, worker, or CLI adapter owns duplicated business orchestration.
6. Object storage, OIDC, tenant isolation, and duplicate-publication controls are scheduled before the first external pilot.
