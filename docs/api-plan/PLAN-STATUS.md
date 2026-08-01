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
- Provider-neutral tenant object storage with strict byte/MIME/hash validation,
  quarantine/promotion, multipart evidence checks, and legacy authority cutover.
- Safe publication-intent and recovery handoff. Publication remains read-only
  toward YouTube; mismatched or uncertain provider evidence cannot trigger a
  blind upload retry.

## Deliberately unavailable

- Public upload/download and publication mutation routes.
- Automatic OIDC/API-key policy combination and public key issuance.
- Executable webhook role without an approved external secret resolver.
- Generic dispatch of arbitrary CLI/filesystem commands from durable jobs.
- Canonical media job dispatch and automatic asset/approval-challenge
  materialization; those still require the profile task bindings and worker
  composition.

## External and product gates

- Select/configure the operator IdP, secret manager/KMS, and S3-compatible
  storage deployment; provision real tenant memberships and egress policy.
- Approve pilot quota values, provider retry-cost ownership, retention,
  residency, RTO/RPO, and operational escalation policy.
- Prove YouTube resumable-session/recovery-marker semantics with controlled
  credentials and fault injection; implement a real channel lease and fresh
  approval/credential authority before enabling uploads.
- Complete canonical Dark Truth/mathematics task bindings, CLI cutover, live
  provider batch evidence, restore/rotation/failover/load drills, and GA parity.

## Verification status

Focused application, persistence, API, SDK, webhook, object-storage, worker,
and publication suites and affected package typechecks passed during the task.
Live PostgreSQL integration was not rerun: the available suite truncates shared
integration tables and destructive execution was not authorized. No live IdP,
secret-store, object-store, or provider call was made.

## Next release gate

Supply the external decisions/evidence above, then compose the canonical media
job handler and controlled pilot infrastructure. External API exposure remains
forbidden until those gates and the operations checklist are signed off.
