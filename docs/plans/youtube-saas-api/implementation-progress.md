# YSAAS implementation progress

Current wave: Wave 5 in progress (YSAAS-017 lineage prerequisite complete; YSAAS-018 and YSAAS-020 remain blocked)

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
Status: partial / blocked
Commit: 07c3653
Validation: focused web runtime and API integration tests pass; API SDK build and web/API typechecks pass
Notes: Canonical tenant/project/episode production-state API, SDK, BFF, episode workspace, review queue, and immutable approval history are implemented. `69de15d` adds append-only worker-bound production-unit snapshot persistence plus tenant/project/episode reads and metadata comparisons; invalidation previews now load persisted snapshots instead of accepting client copies. Invalidation confirmation remains to be wired in the BFF.

### YSAAS-018
Status: blocked
Notes: The domain resolver exists, but no tenant-scoped capability/configuration read API exposes inherited, overridden, and resolved selectable options. The current hard-coded pilot mapping must not be extended.

### YSAAS-020
Status: in progress
Commit: 281a6c7
Validation: exact credential-rotation integration test pass; domain build pass
Notes: Credential rotation with bounded overlap, ETag and idempotency preconditions, show-once secret, replay redaction, OpenAPI, and SDK support are complete. The BFF/UI journey, step-up confirmation hook, webhook management, and API explorer remain.
