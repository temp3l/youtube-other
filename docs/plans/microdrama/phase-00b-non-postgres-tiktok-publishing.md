# Phase 00B — Embedded persistence and TikTok publishing architecture

Date: 2026-08-12
Status: ACTIVE

## Purpose

Correct Phase 00 for the approved local-first microdrama deployment. This plan
selects embedded structured persistence for the new microdrama bounded context
and expands TikTok from a high-level adapter into approval-gated official API
work. It does not migrate or remove legacy PostgreSQL functionality.

## Persistence decision

- The microdrama structured authority is an embedded SQLite database accessed
  through provider-neutral repositories. PostgreSQL is not required and Prisma
  must not be added.
- Use versioned migrations, foreign keys, transactions, WAL where supported,
  optimistic revisions/CAS, append-only events and attempts, unique idempotency
  keys, and replayable projections.
- Store narrative revisions, current-state projections, import provenance,
  artifact metadata, approvals, effects, schedules, publications, and analytics
  references as typed structured records.
- Store scripts, source documents, audio, images, video, alignments, renders,
  provider payload evidence, and other large bytes in filesystem/object-backed
  hash-addressed storage. The database stores hashes, paths/URIs, MIME, size,
  lineage, and approval state, not the bytes.
- Reuse `@mediaforge/workflow-engine`. Add an embedded adapter for its durable
  state/effect ports; do not create another workflow engine or make filesystem
  presence the structured authority.
- The existing `SQLitePersistence` episode-manifest table is precedent, not a
  sufficient microdrama schema. Existing PostgreSQL packages and API paths stay
  untouched until separately scoped legacy work.

## Publication domain

Publication identity includes provider, immutable provider account ID,
canonical episode and revision, locale, render hash, metadata revision,
credential version, creator-consent revision, exact export-approval revision,
attempt, approval, and idempotency key.

Provider adapters remain explicit. YouTube keeps its own projection and safety
rules. TikTok receives its own OAuth/account, metadata, transfer, Direct Post,
status, and reconciliation implementations. No generic publisher may hide
provider semantics.

## TikTok official API architecture

1. Register exact TikTok accounts and OAuth grants through a typed account
   domain. Persist only an opaque credential handle and immutable version.
2. Store tokens through the repository secret-store abstraction backed by a
   secure OS/local credential facility. Fail closed when secure storage is not
   available; never write plaintext tokens into SQLite, JSON, logs, or reports.
3. Before each mutation, resolve `PublicationTargetProfile(locale, provider)`,
   verify the authenticated account and creator information, recheck approval,
   consent/export revisions, media/metadata hashes, privacy, interaction
   settings, capability, policy fields, and AI/commercial-content declarations.
4. Use TikTok's official Content Posting APIs only. Undocumented/private APIs,
   browser automation, and implicit "currently logged in" account selection are
   rejected.
5. Default local rendered files to `FILE_UPLOAD`, using provider-advertised
   chunk constraints, bounded streaming, exact byte ranges, and resumable local
   evidence. Permit `PULL_FROM_URL` only for an explicitly configured,
   TikTok-verified, operator-owned HTTPS domain and immutable source hash.
6. Direct Post initialization creates a durable prepared effect before network
   dispatch. An attempt never changes provider account, credential version,
   locale, render, or metadata after preparation.
7. Only pre-dispatch or explicitly documented safe failures retry. A timeout or
   ambiguous post-dispatch result becomes `OUTCOME_UNCERTAIN`; read-only status
   reconciliation decides whether a new attempt is safe.
8. Scheduling is operator policy keyed by provider, locale, account, and
   audience timezone. Persist instants in UTC. `MANUAL` requires a dispatch-time
   operator action. `PREAPPROVED_SCHEDULED` records exact per-post operator
   consent at scheduling time and may dispatch without a fresh click only after
   account, OAuth, app/audit, creator capability, hash, approval, consent/export,
   privacy, interaction and declaration revalidation. Any change blocks. The
   scheduled mode remains capability-off until TikTok audit/policy evidence and
   explicit deployment/operator enablement exist.

TikTok app/audit readiness is durable, revisioned evidence distinct from account
preflight. It covers developer app/product configuration, Login Kit, callback
configuration, required/granted scopes, Content Posting API access,
creator-info/export and explicit-consent UX, audit submission/result, and
effective/expiry/revocation state. Provider approval cannot be inferred from
local configuration or tests.

Creator consent and export approval are separate durable revisions. The exact
TikTok export approval binds compatible creator capability and consent evidence,
account, render/artifact hashes, metadata, privacy, interaction settings,
AI/commercial declarations, approver, and timestamp. Direct Post may consume
only a compatible, active revision.

Persist provider request/correlation IDs, response identity, rate-limit headers,
`Retry-After`, next-eligible time, attempt/fence identity, and reconciliation
evidence. Provider throttling pauses the one semantic retry owner; SDK and worker
layers must not add overlapping retries or retry a mutation merely because a
rate-limit wait elapsed.

## State and safety

```text
draft intent
  -> approved
  -> prepared
  -> in_flight
  -> published | failed_known | outcome_uncertain
  -> reconciled
```

Provider effects use one semantic retry owner. SDK, adapter, and worker retry
loops must not overlap. Publication capability defaults off. Private canaries
precede audited public canaries, and neither is authorized by this plan.

Approval or consent/export revocation blocks queued/prepared work and later
mutable effects. Cancellation
is cooperative only before irreversible dispatch; an in-flight cancellation
request records intent and moves through reconciliation rather than claiming the
provider effect was cancelled. A force option cannot bypass immutable intent or
idempotency identity.

All provider inputs and responses are untrusted. Validate schemas, bounded
sizes, URLs, MIME, hashes, and account identity; redact tokens, signed URLs,
payload secrets, and personal data from logs while retaining immutable audit
correlation.

## Implementation consequences

- Embedded persistence is additive to the new microdrama bounded context.
- TikTok is split into bounded tasks for account/OAuth, secret storage,
  creator-info preflight, app/audit readiness, consent/export UX, metadata,
  transfer, Direct Post, reconciliation, scheduling, read-only OAuth/preflight,
  and publication canaries.
- Every publication task declares whether external or publication calls are
  eligible and still requires task-specific operator authorization.
- No production functionality is implemented in Phase 00B.
