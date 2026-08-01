# API Plan Status

- **Overall status:** Internal API and durable control-plane foundations implemented; external pilot remains fail-closed
- **Last updated:** 2026-08-01
- **Implementation record:** API task reports 00–25 plus the 2026-08-01 continuation reports under `docs/reports/`

## Implemented foundation

- PostgreSQL tenant-scoped projects, typed episodes, revisions, workflow runs,
  steps, jobs, idempotency, fenced leases, outbox, dead letters, validation,
  approval challenges, publication intents, reconciliation, webhook delivery,
  quota reservations, usage/audit ledgers, principals, and pilot API keys.
- Authenticated Node API process with bounded JWKS loading, active principal
  directory checks, route-specific permissions, health/readiness, strong ETags,
  signed cursors, Problem Details, redacted job failures, and OpenAPI 3.1.
- Dependency-free TypeScript SDK covering the implemented HTTP contract,
  polling, cursor iteration, conditional/idempotent requests, problems, and
  webhook verification.
- Durable job and webhook worker cores, production process composition ports,
  SSRF-resistant pinned HTTPS webhook transport, transactional workflow-event
  fanout, endpoint provisioning, replay, retry, and dead-letter persistence.
- Strict persisted-run workflow job dispatch with propagated cancellation,
  deadlines, fencing, and attempt controls. Exact-command dispatch now binds
  the admitted `episode-production` job to an injected canonical runner.
- All 33 safe Dark Truth story, localization, media, validation, render,
  metadata, and publication-dry-run tasks have canonical adapters with hashed
  lineage, approval evidence, provider authorization, and fail-closed service
  composition. Manual approval and irreversible publication remain unbound.
- All 16 executable mathematics tasks are bound through publication dry-run;
  connected and simulation CLI acceptance use canonical workflow state.
- Stable public webhook event subjects and versions, immutable delivery facts,
  explicit sensitive-field rejection, bounded payloads, and signature coverage.
- Atomic active-workflow and provider-budget reservations with attempt
  attribution, settlement, terminal release, and fail-closed external policy.
- Provider-neutral tenant object storage with strict byte/MIME/hash validation,
  quarantine/promotion, multipart evidence checks, and legacy authority cutover.
- Fenced publication-channel leases and resumable asset-migration inventory,
  validation, cutover, rollback-window, and provenance persistence.
- Safe publication-intent and recovery handoff. Publication remains read-only
  toward YouTube; mismatched or uncertain provider evidence cannot trigger a
  blind upload retry.
- Connected `mediaforge api` CLI commands for project/episode admission,
  workflow observation and control, job status, and approval decisions, backed
  by the SDK and environment-only credentials. Contract/SDK compatibility is
  checked for operations, schemas, headers, problems, and enum/const changes.
- Evidence-backed release-gate records prevent unverified or expired matrix
  cells from being advertised.

## Deliberately unavailable

- Public upload/download and publication mutation routes.
- Automatic OIDC/API-key policy combination and public key issuance.
- Executable webhook role without an approved external secret resolver.
- Generic dispatch of arbitrary CLI/filesystem commands from durable jobs.
- Irreversible publication task bindings, automatic asset/approval-challenge
  materialization, approved production Dark Truth service injection, and a
  deployable worker process with provider credentials.

## External and product gates

- Select/configure the operator IdP, secret manager/KMS, and S3-compatible
  storage deployment; provision real tenant memberships and egress policy.
- Approve pilot quota values, provider retry-cost ownership, retention,
  residency, RTO/RPO, and operational escalation policy.
- Prove YouTube resumable-session/recovery-marker semantics with controlled
  credentials and fault injection; implement a real channel lease and fresh
  approval/credential authority before enabling uploads.
- Complete production Dark Truth service composition, legacy file-oriented CLI
  retirement, reviewed mathematics content acceptance, live provider batch
  evidence, restore/rotation/failover/load drills, and GA parity.

## Verification status

Focused application, persistence, API, SDK, webhook, object-storage, worker,
publication, connected-CLI, canonical Dark Truth, and compatibility suites and
affected package checks passed during the task. The latest combined unit pass
had 113 passing tests; one mathematics registry fixture exposed a stale
curriculum-identity setup and was corrected without a further rerun after the
repair budget was exhausted. The targeted HTTP suite passed 16 tests, and all
seven affected package typechecks passed.
Live PostgreSQL integration was not rerun: the available suite truncates shared
integration tables and destructive execution was not authorized. No live IdP,
secret-store, object-store, or provider call was made.

## Next release gate

Complete the remaining profile bindings and deployment composition while the
external decisions/evidence above are supplied. External API exposure remains
forbidden until those gates and the operations checklist are signed off.
