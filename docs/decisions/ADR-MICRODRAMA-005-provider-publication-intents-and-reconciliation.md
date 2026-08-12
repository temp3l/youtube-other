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
render hash, metadata revision, approval, and idempotency key. Dispatch rechecks
the authenticated account and creator capability immediately before mutation.

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

ADR-OPERATIONS-001 remains the execution-authority constraint: schedules are
durable plans, not permission for unattended or public-API publication.
Execution is operator-initiated through the controlled capability-off path.

## Consequences

- Wrong-account and duplicate-publication risk become fail-closed invariants.
- OAuth secrets require opaque versioned credential handles and secure storage.
- TikTok work is split into account/OAuth, creator preflight, metadata,
  transfer, Direct Post, reconciliation, scheduling, and canary tasks.
- Locale and provider account remain part of publication and analytics identity.
- Scheduling may prepare due work but cannot initiate a provider mutation
  without a fresh operator action and all publication fences.
- Operational telemetry can explain throttling and reconciliation without
  exposing tokens, signed URLs, or sensitive provider payloads.

## Alternatives rejected

- A featureless generic `SocialPublisher`.
- Undocumented TikTok APIs, browser automation, or implicit logged-in accounts.
- Mutable account/credential identity within an attempt.
- Blind retry after timeout or ambiguous provider effects.
- Treating a plan or backlog flag as live publication authorization.
