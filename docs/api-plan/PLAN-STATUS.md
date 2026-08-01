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
  deadlines, fencing, and attempt controls. The first 16 canonical Dark Truth
  story/localization tasks are bound through injected source-authoritative
  services; media-generation and publication task families remain unbound.
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
- Canonical dispatch for the remaining Dark Truth media/publication families,
  all mathematics task bindings, automatic asset/approval-challenge
  materialization, and deployment worker composition.

## External and product gates

- Select/configure the operator IdP, secret manager/KMS, and S3-compatible
  storage deployment; provision real tenant memberships and egress policy.
- Approve pilot quota values, provider retry-cost ownership, retention,
  residency, RTO/RPO, and operational escalation policy.
- Prove YouTube resumable-session/recovery-marker semantics with controlled
  credentials and fault injection; implement a real channel lease and fresh
  approval/credential authority before enabling uploads.
- Complete remaining Dark Truth/mathematics task bindings, legacy CLI cutover, live
  provider batch evidence, restore/rotation/failover/load drills, and GA parity.

## Verification status

Focused application, persistence, API, SDK, webhook, object-storage, worker,
publication, connected-CLI, and compatibility suites and affected package
builds passed during the task. The final combined continuation check covered
126 unit and 14 HTTP integration tests. The new Dark Truth adapter's focused
test exceeded its original five-second timeout during repair and was not rerun
after the verification budget was exhausted; its affected package build passed.
Live PostgreSQL integration was not rerun: the available suite truncates shared
integration tables and destructive execution was not authorized. No live IdP,
secret-store, object-store, or provider call was made.

## Next release gate

Complete the remaining profile bindings and deployment composition while the
external decisions/evidence above are supplied. External API exposure remains
forbidden until those gates and the operations checklist are signed off.
