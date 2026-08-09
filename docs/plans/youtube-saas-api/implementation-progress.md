# YSAAS implementation progress

Current wave: Wave 5 complete (YSAAS-017, YSAAS-018, and YSAAS-020 complete)

## Anti-stuck execution rules (session)

- Finish and commit one YSAAS task before starting the next.
- Prefer `git show <commit>:path` + shell extraction over parallel multi-file `Write` batches.
- One `pnpm test:focused -- <file>` per shell invocation; no chained acceptance runs.
- Keep file reads narrow (line limits); avoid repo-wide greps with `**/*` globs.
- If a focused test fails twice after targeted fixes, record blocker and continue queue only when dependency graph allows skipping.

## Ledger

### YSAAS-001
Status: completed
Commit: dfaa182
Validation: domain + persistence unit tests pass; package typechecks pass
Notes: ProductionRevision, EpisodeProductionState projection, migration registry

### YSAAS-004
Status: completed
Commit: bc82308
Validation: SDK registry unit test pass; web saas-runtime unit test pass; OpenAPI/contract API tests blocked by pre-existing dark-truth vitest resolution (not introduced by this task)
Notes: Modular OpenAPI path modules, SDK operation modules, web gateway/page registries

### YSAAS-002
Status: completed
Commit: 3214f7b
Validation: capability-configuration unit test pass (6); domain typecheck pass
Notes: Layered capability/config contracts, resolver with provenance, admission evaluator with typed rejections

### YSAAS-003
Status: completed
Commit: 4316c6e
Validation: command-security unit test pass (8); domain/application/persistence typecheck pass
Notes: Membership/action grants, idempotency replay model, audit envelope, principal-directory migration registry

### YSAAS-005
Status: completed
Commit: 96270b5
Validation: `workflow-portfolio.unit.test.ts` pass (6); `workflow-portfolio-repository.unit.test.ts` pass (2); `pnpm exec tsc -p packages/persistence` pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Portfolio filter contracts, recovery classifier, projector, persistence SQL source query + row mapper, `GET /v1/workspaces/{workspace}/workflow-portfolio` API/SDK route; resume/cancel/abandon actions reference existing workflow commands

### YSAAS-006
Status: completed
Commit: 50272db
Validation: `artifact-invalidation.unit.test.ts` pass (4); domain emit pass; `apps/api` postgres use-case typecheck pass
Notes: Production-unit graph, invalidation preview, gate evidence; API preview + regeneration routes; persistence unit loader and selective workflow execution deferred

### YSAAS-010
Status: completed
Commit: cfaffb0
Validation: `usage-quota.unit.test.ts` pass (10); domain/persistence emit pass; `apps/api` typecheck pass for new quota/health routes
Notes: Usage dimensions, reservation lifecycle, estimate projection with cache/reuse, provider health resolver; enriched quota dimensions, usage filters, `GET /v1/workspaces/{workspace}/provider-health`

### YSAAS-009
Status: in progress
Commit: 9236fa2, 3188f69, 0e50124, 5b8358a, 6f88755, 6a5bd38, 3475923, ba5db9e, 2134144, 4140d7a, bd39623
Validation: focused bulk preflight, persistence migration, and API SDK tests pass; domain build, persistence/API/SDK typechecks pass. API contract suite is blocked before collection by pre-existing missing `@mediaforge/domain/visual-retention/treatment-catalog.js` from built `dark-truth`.
Notes: Added a bounded, deterministic bulk selection preflight that preserves an eligibility reason for every candidate and excludes successful/permanent-failure items from retry selection. Persisted tenant-scoped batch/item rows retain all selected items and their eligibility evidence, with idempotency conflict protection and RLS. API/OpenAPI/SDK expose tenant-scoped reads, authoritative preflight, and quota-backed launch. Launch reserves configured active-batch/item capacity, claims each item once, rereads current configuration/revision, admits the existing child workflow, and records queued child IDs or safe rejection codes. Fenced durable-job terminal mutations settle the linked item in that same tenant transaction, including dead letters and cancellation; a terminal aggregate releases only that batch's still-reserved active capacity. Retry generations reset only retryable/cancelled items and reserve only newly runnable items. Child cancellation fan-out and BFF remain.

### YSAAS-011
Status: completed
Commit: 639a9a4
Validation: `api-credential-lifecycle.unit.test.ts` pass (4); domain/application/persistence/api-sdk emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Named credential lifecycle, show-once issue with idempotency replay, revoke with If-Match, developer journey examples; API routes + OpenAPI/SDK developer-credential module; pilot key admin `name` env; rotate overlap persistence (no public rotate route yet)

### YSAAS-012
Status: completed
Commit: 2c96364
Validation: `webhook-lifecycle.unit.test.ts` pass (4); domain/persistence/application/api-sdk emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Webhook endpoint CRUD, show-once secret create/rotate with overlap, test delivery, delivery history with redacted summaries, attempt listing, resend replay; encrypted signing-secret store; OpenAPI/SDK webhook module; `webhook.manage` permission

### YSAAS-015
Status: completed
Commit: e43ebf7
Validation: `content-reuse-lifecycle.unit.test.ts` pass (6); `postgres-content-reuse-repository.unit.test.ts` pass (1); domain/persistence/api-sdk emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Clone episode with idempotency and asset policy filtering; production template CRUD/versioning with pinned apply bindings; reusable asset search and immutable asset reference attach; lifecycle OpenAPI/SDK module; persistence tables for templates, bindings, references, clone idempotency

### YSAAS-016
Status: completed
Commit: 0eef7b9
Validation: `content-lifecycle.unit.test.ts` pass (7); `postgres-content-lifecycle-repository.unit.test.ts` pass (1); domain/persistence/api-sdk emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Episode archive/restore/tombstone deletion with retention fail-closed evaluation; workspace retention policy read (unresolved when unconfigured); episode list visibility filter; lifecycle OpenAPI/SDK routes; persistence for lifecycle state, retention policy, deletion idempotency

### YSAAS-007
Status: completed
Commit: 5b8e493
Validation: `review-lifecycle.unit.test.ts` pass (7); `postgres-review-repository.unit.test.ts` pass (1); domain/persistence emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Review queue/history/validity projections; submit/claim/decide lifecycle with producer separation; `request_changes` decision; optional approve rationale; `approval.request_changes` webhook event; review OpenAPI/SDK module; challenge metadata persistence for submitter/claim

### YSAAS-008
Status: completed
Commit: 4562314
Validation: `localization-derivative.unit.test.ts` pass (5); `postgres-localization-derivative-repository.unit.test.ts` pass (1); domain/persistence emit pass; `apps/api` typecheck pass excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Locale derivative records with source fingerprint linkage; visual asset reuse classification; preflight/compare/retry API; localization OpenAPI/SDK module; derivative episode creation with localized slug metadata

### YSAAS-013
Status: completed
Commit: 9011a68
Validation: `publication-preparation-lifecycle.unit.test.ts` pass (6); `postgres-publication-preparation-repository.unit.test.ts` pass (1); domain/persistence/api-sdk emit pass; `apps/api` typecheck pass for YSAAS-013 files excluding pre-existing `job-process` / `provider-free-worker-entry` migrate errors
Notes: Publishing channel safe state + OAuth session binding; metadata revisions; publish-ready preflight gate (ADR-YSAAS-015); schedule policy fail-closed; intent prepare/cancel/schedule supersede; publication-preparation OpenAPI/SDK module; `cancelPublicationIntent` on workflow repository

### YSAAS-014
Status: completed
Commit: 33c7a4b
Validation: `publication-execution.unit.test.ts` pass (7); `pnpm exec tsc -p packages/persistence --noEmit` pass
Notes: Default-off platform capability; no provider mutation while disabled; private-first fenced executor with immediate authority/metadata recheck, bounded metadata retry, tenant-bound provider/OAuth seam, and existing reconciliation for upload ambiguity. Public API/SDK mutation routes remain absent.

### YSAAS-021
Status: completed
Commit: 3dd25da
Validation: `saas-runtime.unit.test.ts` pass (4); targeted API SDK build and web typecheck pass
Notes: Server-side publishing BFF/SDK methods; channel status/connect/disconnect; immutable preflight/prepare confirmation; safe publication status/schedule/cancel pages; flag-off hides executable control and reconciliation remains read-only. Metadata-only changes create a new immutable intent without media regeneration.

### YSAAS-017
Status: completed
Commit: fcd3b88
Validation: API SDK build and web typecheck pass; focused web runtime test blocked by sandbox loopback socket `EPERM` before journey assertions
Notes: Canonical tenant/project/episode production-state API, SDK, BFF, episode workspace, review queue, immutable approval history, and `69de15d` worker-bound production-unit lineage persistence are implemented. `fcd3b88` completes comparison and a server-held, tenant/project/episode-bound invalidation confirmation; the browser never supplies snapshots or computes targets. Pending confirmations are process-local and must move to shared durable session state for horizontal scaling.

### YSAAS-018
Status: completed
Commit: ab7d835
Validation: configuration persistence focused test, API typecheck, API SDK build, and web typecheck pass
Notes: Tenant, profile/genre, and episode configuration layers persist under workspace RLS with schema-validated reads. Workspace capabilities and episode resolved-configuration APIs fail closed when unprovisioned. The settings page and workflow locale selector now use server responses; the pilot locale mapping is removed.

### YSAAS-020
Status: completed
Commit: 07b052b
Validation: recent-auth adapter and API SDK focused tests pass; API SDK build and web typecheck pass
Notes: `587483a` persists atomic one-time recent-auth confirmations bound to workspace/principal/action/CSRF session; `873e045` requires matching IdP principal, MFA AMR, and auth_time no older than five minutes; `32b746a` provides BFF consumption. The final integration BFF adds the shared Postgres composition adapter, fail-closed single-use gates for credential/webhook mutations, show-once direct secret responses, credential and webhook status/history, redacted resend/test controls, and generated journey steps. A real deployment must pass the adapter into OIDC and runtime; this repository has no server composition entrypoint.
