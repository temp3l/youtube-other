# ADR-MICRODRAMA-005: Provider publication intents and reconciliation

Date: 2026-08-12
Status: accepted

## Context

TikTok and YouTube differ in OAuth, account/capability discovery, metadata,
transfer, status, scheduling, and recovery. Publication is an irreversible
external effect where a timeout may hide a successful provider action.

## Decision

Use provider-specific adapters behind a shared publication-intent boundary.
TikTok uses official APIs only. Each attempt immutably binds provider,
providerAccountId, credential version, canonical episode/revision, locale,
render hash, metadata revision, approval, consent/export revisions, and
idempotency key. Dispatch rechecks the authenticated account and creator
capability immediately before mutation.

Creator rights/consent and post export approval are durable revisioned evidence,
not booleans inferred from asset presence. A `CreatorContentConsentRevision`
records the consenting subject/rightsholder, evidence hash/source, permitted
media/use/locale/provider/territory, effective/expiry/revocation state, and
timestamp. A `TikTokPostExportApprovalRevision` references compatible consent
and creator-info/capability evidence and binds the exact TikTok account, render
and artifact-manifest hashes, metadata revision, privacy, interaction settings,
AI/commercial declarations, operator, and consent/approval timestamp.
`PUBLICATION_APPROVED` binds the exact export approval. Direct Post preparation
and initialization reject missing, expired, revoked, or mismatched evidence.

Effects are durably prepared before dispatch. Retry only pre-dispatch or
explicitly documented safe failures. Ambiguous post-dispatch outcomes become
`OUTCOME_UNCERTAIN` and use read-only provider status reconciliation; never
blindly retry. One application/workflow owner controls semantic retries.

Effect evidence includes provider request/correlation and response identities,
attempt/fence identity, rate-limit state, `Retry-After`/next-eligible time, and
reconciliation outcome. Rate-limit recovery never weakens immutable intent,
approval, account, or idempotency fences.

Publication capabilities default off. Private canaries and audited public
canaries require separate explicit operator authorization. YouTube and TikTok
keep separate metadata projections and receipts.

Persist `DispatchMode = MANUAL | PREAPPROVED_SCHEDULED`. `MANUAL` requires an
operator action at dispatch. In `PREAPPROVED_SCHEDULED`, the operator initiates
the exact post by reviewing and consenting when it is scheduled; no fresh click
is required at dispatch. Dispatch must revalidate account, OAuth grant, creator
capabilities, app/audit readiness, render/metadata hashes, privacy, interactions,
declarations, approval and consent/export revisions. Any material change blocks
instead of substituting. This mode remains capability-off until TikTok audit and
policy requirements are evidenced and an operator explicitly enables it.

TikTok app readiness is separate from creator/account capability. Durable
revisioned evidence covers developer app/product configuration, Login Kit,
callback/config hashes, required and granted scopes, Content Posting access,
creator-info/export and consent UX, audit submission/result, environment,
effective/expiry/revocation state, and opaque app-credential version. Local
fixtures cannot assert provider approval.

## Consequences

- Wrong-account and duplicate-publication risk become fail-closed invariants.
- OAuth secrets require opaque versioned credential handles and secure storage.
- TikTok work is split into account/OAuth, creator preflight, metadata,
  transfer, Direct Post, reconciliation, app/audit readiness, scheduling, and
  read-only/publication canary tasks.
- Locale and provider account remain part of publication and analytics identity.
- Exact schedule-time consent can authorize later dispatch only in enabled
  `PREAPPROVED_SCHEDULED` mode; changed or revoked fences block dispatch.
- Operational telemetry can explain throttling and reconciliation without
  exposing tokens, signed URLs, or sensitive provider payloads.

## Alternatives rejected

- A featureless generic `SocialPublisher`.
- Undocumented TikTok APIs, browser automation, or implicit logged-in accounts.
- Mutable account/credential identity within an attempt.
- Blind retry after timeout or ambiguous provider effects.
- Treating a plan or backlog flag as live publication authorization.
- Treating generic schedule creation as publication authorization.
- Inferring creator consent, export approval, or app audit status from local
  configuration, prior posts, or asset availability.
