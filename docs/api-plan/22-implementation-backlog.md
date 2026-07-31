# Implementation Backlog

`★` marks the critical path. Packages are independently reviewable; no package authorizes implementation in this planning session.

## 1. Characterization tests and inventory

### ★ API-WP-001 — Execution authority characterization

- **Objective / scope:** executable inventory mapping all 15 operations to entry point, store, artifacts, gates, effects, and normalized outcomes; add Dark Truth full/Short and math fixtures.
- **Out of scope / affected:** no refactor or new behavior; `apps/cli`, workflow/story/math/image/publish tests.
- **Dependencies / migration:** none; freezes legacy behavior and identifies product decisions.
- **Tests / acceptance:** focused parity fixtures, path/store ownership, resume semantics; every operation has a named authority or unresolved decision.
- **Rollback / risks:** tests/docs only; remove fixture if invalid. Risk: canonizes defects—classify each variance.
- **Parallel safety / model:** Safe by non-overlapping operation families; `gpt-5.6-sol`, high.

### ★ API-WP-002 — Publication and external-effect fault characterization

- **Objective / scope:** inject failure before/after upload acceptance, checkpoints, thumbnail, playlist, provider-batch submission.
- **Out of scope / affected:** no live provider calls or target fix; `packages/youtube-upload`, workflow/image/story batch tests.
- **Dependencies / migration:** WP-001 operation map; records exact unsafe states.
- **Tests / acceptance:** deterministic fake provider proves accepted-before-commit and orphan windows; retry classification documented.
- **Rollback / risks:** test-only; risk of unrealistic fake, reviewed against adapter calls.
- **Parallel safety / model:** Safe beside content fixtures; `gpt-5.6-sol`, high.

## 2. Shared application-layer extraction

### ★ API-WP-003 — Application command/context contracts

- **Objective / scope:** strict command/query/result types; actor/workspace/idempotency/correlation/deadline/abort context; stable use-case errors.
- **Out of scope / affected:** no HTTP/DB; new application package plus domain/workflow exports.
- **Dependencies / migration:** WP-001; adapters map current identities without changing behavior.
- **Tests / acceptance:** compile/runtime schema tests; no `any`, path, argv, provider body in contracts.
- **Rollback / risks:** additive removal possible; risk of leaky abstractions.
- **Parallel safety / model:** Conditional on identity naming; `gpt-5.6-sol`, high.

### ★ API-WP-004 — Composition root and port interfaces

- **Objective / scope:** repositories, assets, providers, renderer, publisher, audit/usage, clock/IDs; construct application handlers outside CLI.
- **Out of scope / affected:** no production adapter replacement; application, CLI composition, capability package boundaries.
- **Dependencies / migration:** WP-003; wrap existing implementations.
- **Tests / acceptance:** in-memory conformance and dependency-boundary checks; CLI and tests construct same handler.
- **Rollback / risks:** retain old composition until parity; risk of service locator/oversized port.
- **Parallel safety / model:** Conditional; `gpt-5.6-sol`, high.

### ★ API-WP-005 — Dark Truth canonical task bindings

- **Objective / scope:** bind approved story/localization/audio/image/render/thumbnail/validation services to generic task registry.
- **Out of scope / affected:** no behavior redesign or public API; Dark Truth, CLI, workflow, capability packages.
- **Dependencies / migration:** WP-001 canonical-path decision, WP-003/004.
- **Tests / acceptance:** provider-free full/Short parity, hash/gate/resume tests; no empty implementation registration for supported tasks.
- **Rollback / risks:** feature flag new instances to legacy; highest risk is choosing wrong divergent semantics.
- **Parallel safety / model:** Unsafe across same tasks; `gpt-5.6-sol`, xhigh.

## 3. Workflow-state normalization

### ★ API-WP-006 — Relational workflow/job schema and repositories

- **Objective / scope:** runs, steps, attempts, jobs, leases, events, idempotency, outbox, dead letters with workspace keys/revisions.
- **Out of scope / affected:** no public controllers; persistence/application/workflow.
- **Dependencies / migration:** WP-003/004; JSON remains authority until explicit cutover.
- **Tests / acceptance:** transaction, CAS, two-worker lease/fence, retry/dead-letter/outbox atomicity.
- **Rollback / risks:** additive schema/down migration before writes; risk of wrong DB/offline requirements.
- **Parallel safety / model:** Conditional on approved DB; `gpt-5.6-sol`, xhigh.

### ★ API-WP-007 — JSON importer, projection, and authority marker

- **Objective / scope:** hash-versioned legacy import, `filesystem-legacy|database-v1` marker, compatibility projection and repair status.
- **Out of scope / affected:** no bulk destructive migration; workflow/story/math/persistence/shared.
- **Dependencies / migration:** WP-001, WP-006; cut over per workflow instance.
- **Tests / acceptance:** round-trip fixtures, wrong-writer rejection, projection failure leaves SQL canonical.
- **Rollback / risks:** switch only new instances back; risk of incomplete legacy variants.
- **Parallel safety / model:** Conditional by store family; `gpt-5.6-sol`, high.

## 4. CLI migration

### ★ API-WP-008 — Migrate read/plan/status/create commands

- **Objective / scope:** thin CLI adapters call application queries/commands; preserve output/exit codes.
- **Out of scope / affected:** no paid or irreversible commands; `apps/cli`, application.
- **Dependencies / migration:** WP-003/004/006/007.
- **Tests / acceptance:** packaged CLI parity and normalized result parity; no CLI-owned repository assembly for migrated commands.
- **Rollback / risks:** per-command feature switch; risk of scripting output drift.
- **Parallel safety / model:** Safe by command family; `gpt-5.6-terra`, high.

### ★ API-WP-009 — Migrate generation/render/approval commands

- **Objective / scope:** CLI submits canonical jobs/use cases and polls/streams local status; approval actor mapping.
- **Out of scope / affected:** YouTube publish remains legacy-disabled for DB runs; CLI/application/workflow/capabilities.
- **Dependencies / migration:** WP-005–008.
- **Tests / acceptance:** Dark Truth/math parity, cancellation, resume, cache, approval-binding tests.
- **Rollback / risks:** new workflow instances only; provider cost/regression risk.
- **Parallel safety / model:** Conditional by profile; `gpt-5.6-sol`, xhigh.

## 5. Internal API

### API-WP-010 — OpenAPI foundation and thin controllers

- **Objective / scope:** `/v1` projects, typed episodes, workflow start/status, Problem Details, cursor/ETag/idempotency middleware.
- **Out of scope / affected:** no public exposure/publish; `apps/api`, application, contract package/artifact.
- **Dependencies / migration:** WP-003/004/006/008.
- **Tests / acceptance:** schema/runtime/contract-diff tests; every controller invokes one use case; workspace path response removed.
- **Rollback / risks:** disable API role; risk of framework contract drift.
- **Parallel safety / model:** Safe after contract freeze; `gpt-5.6-sol`, high.

### API-WP-011 — Internal assets, validation, and approval

- **Objective / scope:** asset metadata/download via contained local bridge, validation lists, approval challenges/decisions.
- **Out of scope / affected:** no direct uploads/object store; API/application/shared/workflow.
- **Dependencies / migration:** WP-007/010.
- **Tests / acceptance:** path never serialized, hashes bind approvals, stale ETag/approval rejected.
- **Rollback / risks:** disable endpoints; local shared-volume limitation documented.
- **Parallel safety / model:** Conditional with asset port; `gpt-5.6-terra`, high.

## 6. Worker and queue hardening

### ★ API-WP-012 — Worker leases, heartbeat, cancellation, retry

- **Objective / scope:** separate worker role, fenced claims, task deadlines/heartbeats, abort propagation, weighted classes, dead letters.
- **Out of scope / affected:** no broker adoption; application/workflow/process/render/provider adapters.
- **Dependencies / migration:** WP-006, WP-009.
- **Tests / acceptance:** kill/reclaim/late-writer/cancel FFmpeg/provider tests; live long task never double-claimed.
- **Rollback / risks:** reduce to one worker/new jobs; unsafe effects must not auto-retry.
- **Parallel safety / model:** Unsafe around core dispatcher; `gpt-5.6-sol`, xhigh.

### API-WP-013 — Canonical batch reconciliation

- **Objective / scope:** batch/item records, stable keys, provider custom IDs, partial resume, orphan reconciliation.
- **Out of scope / affected:** provider-specific generation logic unchanged; workflow/story/image/math batch adapters.
- **Dependencies / migration:** WP-002/006/012.
- **Tests / acceptance:** submit-before-commit crash, duplicate poll/import, partial resume and cancellation.
- **Rollback / risks:** retain read-only old manifests; paid duplication.
- **Parallel safety / model:** Conditional by provider; `gpt-5.6-sol`, high.

## 7. Authentication and tenant boundaries

### ★ API-WP-014 — OIDC/service-account auth and authorization policy

- **Objective / scope:** JWT/JWKS validation, memberships, service principals, permission vocabulary, opaque cross-tenant 404.
- **Out of scope / affected:** no channel OAuth; API/application/persistence.
- **Dependencies / migration:** operator IdP decision, WP-006/010.
- **Tests / acceptance:** full BOLA/role/revocation/issuer/key-rotation matrix.
- **Rollback / risks:** keep API internal; auth bypass is forbidden.
- **Parallel safety / model:** Conditional on schema; `gpt-5.6-sol`, xhigh.

### ★ API-WP-015 — Scoped API keys and tenant-safe credentials

- **Objective / scope:** hashed expiring keys, service-account ownership, rotation; encrypted channel/provider credential handles and scoped worker access.
- **Out of scope / affected:** no customer-supplied secrets in jobs; API/persistence/secret adapter/publish.
- **Dependencies / migration:** WP-014 and secret-store decision.
- **Tests / acceptance:** show-once, revoke/rotate, canary-log, cross-workspace decrypt denial.
- **Rollback / risks:** revoke key type/disable publication; credential leakage.
- **Parallel safety / model:** Conditional; `gpt-5.6-sol`, xhigh.

## 8. External API contract

### API-WP-016 — Object storage and presigned transfer

- **Objective / scope:** tenant-prefixed immutable objects, quarantine/validation/promotion, multipart video, signed download, retention cleanup.
- **Out of scope / affected:** no CDN/global dedupe; asset/application/worker/API.
- **Dependencies / migration:** WP-004/006/014 and storage choice.
- **Tests / acceptance:** MIME/hash/size/polyglot, expired URL, cross-tenant, orphan cleanup, local bridge conformance.
- **Rollback / risks:** stop new uploads; keep immutable objects/read path.
- **Parallel safety / model:** Conditional by adapter; `gpt-5.6-sol`, high.

### API-WP-017 — Public contract and TypeScript SDK

- **Objective / scope:** stabilized OpenAPI, pagination/versioning/errors, SDK polling/idempotency/problem helpers and guides.
- **Out of scope / affected:** no additional SDKs/GraphQL/SSE; API contract/SDK/docs.
- **Dependencies / migration:** WP-010/011/014/016.
- **Tests / acceptance:** breaking-diff gate, generated compile, consumer fixtures, examples.
- **Rollback / risks:** keep endpoint pilot-only; premature compatibility burden.
- **Parallel safety / model:** Safe after schema freeze; `gpt-5.6-terra`, high.

## 9. Webhooks and metering

### API-WP-018 — Outbox webhook delivery

- **Objective / scope:** versioned events, HMAC signing/rotation, SSRF-safe endpoints, at-least-once retry/dead letter/replay.
- **Out of scope / affected:** no SSE; event/outbox/API/dispatcher.
- **Dependencies / migration:** WP-006/014.
- **Tests / acceptance:** transaction-loss, replay/tamper/out-of-order, redirects/private IP, retry policy.
- **Rollback / risks:** disable endpoints while retaining outbox; outbound abuse.
- **Parallel safety / model:** Safe after event schema; `gpt-5.6-sol`, high.

### API-WP-019 — Usage ledger, reservations, and quotas

- **Objective / scope:** append-only usage/corrections, provider reconciliation, hierarchical rate/concurrency/storage limits and budget reservation.
- **Out of scope / affected:** no invoicing; observability/persistence/application/API/workers.
- **Dependencies / migration:** WP-006/012 plus product limit decisions.
- **Tests / acceptance:** retry/idempotent replay accounting, concurrent reservation, settlement/release, correction.
- **Rollback / risks:** monitor-only mode; inaccurate limits/costs.
- **Parallel safety / model:** Conditional by operation metrics; `gpt-5.6-sol`, high.

## 10. Pilot hardening

### ★ API-WP-020 — Publication intent and effect journal

- **Objective / scope:** immutable binding, approval/credential recheck, channel lease, private resumable upload receipt, thumbnail/playlist effects, uncertain reconciliation.
- **Out of scope / affected:** no blind force; application/workflow/youtube/persistence/worker.
- **Dependencies / migration:** WP-002/006/012/015 and provider recovery proof.
- **Tests / acceptance:** fault at every boundary produces one video or `reconciliation_required`; revoked approval blocks.
- **Rollback / risks:** disable publish endpoint; highest external-side-effect risk.
- **Parallel safety / model:** Unsafe; `gpt-5.6-sol`, xhigh.

### API-WP-021 — Pilot security and operations gate

- **Objective / scope:** SLOs/alerts/runbooks, tenant restore, key rotation, abuse/load/soak, support reconciliation UI/command.
- **Out of scope / affected:** no GA billing; all runtime roles/operations.
- **Dependencies / migration:** WP-014–020.
- **Tests / acceptance:** threat-model suite, restore/rotation/failover drills, bounded pilot load and signed-off checklist.
- **Rollback / risks:** close pilot admission; operational blind spots.
- **Parallel safety / model:** Safe by drill area; `gpt-5.6-sol`, high.

## 11. General availability hardening

### API-WP-022 — Both-profile/full-Short GA parity

- **Objective / scope:** prove all entitled Dark Truth/math locales, full/Short, approval and publish paths; remove temporary entitlements only with evidence.
- **Out of scope / affected:** no higher math grades unless separately approved; profile/capability/application/E2E suites.
- **Dependencies / migration:** WP-005/009/020/021.
- **Tests / acceptance:** provider-free E2E plus controlled provider smoke for every supported matrix cell.
- **Rollback / risks:** preserve entitlement restriction; incomplete capability claims.
- **Parallel safety / model:** Safe by profile/variant; `gpt-5.6-sol`, xhigh.

### API-WP-023 — GA resilience, lifecycle, and compatibility

- **Objective / scope:** HA/DR, backup/restore, retention/deletion/legal hold, API support/deprecation, webhook replay, capacity and incident exercises.
- **Out of scope / affected:** no new product features; persistence/storage/API/operations/docs.
- **Dependencies / migration:** WP-021/022 and operator RTO/RPO/retention decisions.
- **Tests / acceptance:** restore and region/node failure, deletion proof, contract policy and SLO review.
- **Rollback / risks:** remain pilot; data-loss/compliance/SLA risk.
- **Parallel safety / model:** Conditional by subsystem; `gpt-5.6-sol`, high.

## Recommended first implementation package

Start with API-WP-001, with API-WP-002 in parallel after its publication fixture conventions are agreed. Do not create API routes first.
