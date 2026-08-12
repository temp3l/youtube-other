# Vertical Microdrama Factory architecture index

Date: 2026-08-12
Status: ACTIVE

## Goal

Build a provider-independent serialized microdrama system whose typed,
revisioned narrative state is authoritative and whose expensive media and
publication effects are approval-gated, attributable, resumable, and safe.

## Architecture hierarchy

```text
ADR
  -> active plan
    -> backlog task
      -> implementation
        -> run report
```

Reports are evidence. They cannot supersede an ADR or plan. If implementation
finds a conflict, block the task, approve an architecture amendment or ADR,
update the backlog, then resume.

## Active planning documents

- [Phase 00B: embedded persistence and TikTok](phase-00b-non-postgres-tiktok-publishing.md)
- [Phase 00C-V4: multilingual production profile](phase-00c-v4-seven-minutes-ahead-multilingual-production.md)
- [Authoritative implementation plan](implementation-plan.md)

Historical characterization:

- [Phase 00 repository characterization](phase-00-repository-characterization.md)
  is `SUPERSEDED IN PART`. Its repository findings and provider-independent
  narrative/media direction remain useful; its PostgreSQL microdrama design,
  `7 MINUTES AHEAD` timing default, and high-level TikTok phase do not.
- No persisted V3-specific Phase 00C document was found. V3 series assumptions
  are superseded by Phase 00C-V4.

Related repository material is classified, not silently inherited:

- `prompts/phase-00-vertical-microdrama-factory-architecture-planning-prompt.md`
  is planning input. Its 60–90 second, PostgreSQL-investigation, and generic
  localization assumptions cannot override this index.
- `docs/reports/codex-runs/2026-08-12-persist-microdrama-phase-00-plan.md`
  and later run reports are implementation/planning evidence only.
- `docs/story-to-video.md` and `docs/whitepaper/*` describe current repository
  capability, including the absence of TikTok publishing; they are not target
  architecture.
- `docs/api-plan/*` governs its API/SaaS scope. Its shared application-layer,
  approval, idempotency, immutable-effect, cancellation, and reconciliation
  safeguards are reused. Its PostgreSQL/tenant/deployment choices do not govern
  the embedded microdrama bounded context.
- TikTok source-ingestion scaffolding is not a publishing adapter and satisfies
  none of the TikTok publication backlog tasks.
- Other series/creator plans, including Veronica localization plans, do not
  define `7 MINUTES AHEAD` canon, locale, timing, media, or publication policy.

## Active ADRs

- [ADR-MICRODRAMA-001: structured narrative state and revisions](../../decisions/ADR-MICRODRAMA-001-structured-narrative-state-and-revisions.md)
- [ADR-MICRODRAMA-002: embedded persistence and artifact boundary](../../decisions/ADR-MICRODRAMA-002-embedded-microdrama-persistence-and-artifact-boundary.md)
- [ADR-MICRODRAMA-003: rolling planning and analytics admission](../../decisions/ADR-MICRODRAMA-003-rolling-canon-planning-and-analytics-admission.md)
- [ADR-MICRODRAMA-004: one canon, locale projections, selected-audio timing](../../decisions/ADR-MICRODRAMA-004-one-canon-locale-projections-and-selected-audio-timing.md)
- [ADR-MICRODRAMA-005: provider publication intents and reconciliation](../../decisions/ADR-MICRODRAMA-005-provider-publication-intents-and-reconciliation.md)

The generic speech ADRs remain complementary. Existing API/PostgreSQL ADRs
remain applicable to their original API/legacy scope but do not select
microdrama persistence.

Complementary active constraints:

- [ADR-OPERATIONS-001](../../decisions/ADR-OPERATIONS-001-current-scope-and-publication-authority.md)
  keeps publication initiation operator-controlled and capability-off by
  default. For Microdrama, `PREAPPROVED_SCHEDULED` treats the operator's exact,
  revision-bound consent at scheduling time as initiation; dispatch needs no
  fresh click but must fail closed on any changed fence and remains disabled
  until TikTok audit/policy evidence permits it.
- ADR-SPEECH-001 through ADR-SPEECH-003 retain one provider-neutral speech
  service, immutable voice profile versions, and no silent provider fallback.

## Decision precedence

| Decision | Original source | Current authoritative source | Status |
|---|---|---|---|
| Structured narrative state, not prose/media, is canon | Phase 00 sections E–F | ADR-MICRODRAMA-001 | ACTIVE |
| PostgreSQL is microdrama authority | Phase 00 sections A, S, X; ADR-API-004 recommendation | ADR-MICRODRAMA-002 | SUPERSEDED |
| Embedded SQLite is the microdrama structured store; Prisma is absent | Later no-PostgreSQL policy | Phase 00B; ADR-MICRODRAMA-002 | ACTIVE |
| V3 is the current `7 MINUTES AHEAD` production pack | V3 content-pack lineage | Phase 00C-V4; ADR-MICRODRAMA-004 | SUPERSEDED |
| V4 multilingual is the current production corpus | V4 pack | Phase 00C-V4 | ACTIVE |
| Supplied locales require future translation generation | Phase 00 generic localization path | Phase 00C-V4 | SUPERSEDED |
| Supplied V4 scripts are imported approved locale revisions | V4 pack | Phase 00C-V4; ADR-MICRODRAMA-004 | ACTIVE |
| 60–90 seconds is the `7 MINUTES AHEAD` episode target | Phase 00 generic default | Phase 00C-V4 | SUPERSEDED |
| `7 MINUTES AHEAD` uses 56–62 lexical seconds and about one minute selected audio | V4 root/locale profiles | Phase 00C-V4 | ACTIVE |
| Shared `160 WPM` drives V4 runtime timing | V3 heritage in `shared/series-state.json` | Phase 00C-V4 field authority | SUPERSEDED |
| V4 lexical WPM is en-US 155, de-DE 150, es-ES 155, pt-BR 155 | V4 manifests and locale READMEs | Phase 00C-V4 | ACTIVE |
| Selected locale audio and alignment determine final timing | V3/V4 timing notes | ADR-MICRODRAMA-004 | ACTIVE |
| One high-level TikTok adapter phase is sufficient | Phase 00 phase 14 | Phase 00B; ADR-MICRODRAMA-005 | SUPERSEDED |
| Official TikTok APIs, immutable account binding, idempotency, and reconciliation | Later publication policy | Phase 00B; ADR-MICRODRAMA-005 | ACTIVE |
| A schedule without exact per-post operator consent may authorize publication | Phase 00 generic scheduling possibility | ADR-OPERATIONS-001; Phase 00B; ADR-MICRODRAMA-005 | REJECTED |
| `MANUAL` dispatch requires an operator action at dispatch | ADR-OPERATIONS-001 update | Phase 00B; ADR-MICRODRAMA-005 | ACTIVE |
| `PREAPPROVED_SCHEDULED` may dispatch without a fresh click after exact schedule-time consent and unchanged-fence revalidation | Later Microdrama scheduling requirement | Phase 00B; ADR-MICRODRAMA-005 | ACTIVE; capability disabled pending audit/policy gate |
| Creator consent/export approval may be inferred from asset availability or an earlier post | None; unsafe alternative | ADR-MICRODRAMA-005 | REJECTED |
| TikTok consent/export evidence is immutable, revision-bound, and exact-post scoped | Later publication policy | Phase 00B; ADR-MICRODRAMA-005 | ACTIVE |
| Local configuration alone proves TikTok app/audit readiness | None; unsafe alternative | ADR-MICRODRAMA-005 | REJECTED |
| Build a provider-generic `SocialPublisher` | Phase 00 rejected anti-pattern | ADR-MICRODRAMA-005 | REJECTED |
| Rolling plans may revise accepted canon directly | None; unsafe alternative | ADR-MICRODRAMA-003 | REJECTED |
| Analytics become canon only through future explicit admission | Phase 00 learning architecture | ADR-MICRODRAMA-003 | ACTIVE |
| Generate additional locales beyond V4 | Phase 00 generic localization | Implementation plan, after V4 admission | DEFERRED |
| Initial music/SFX may use generated providers | Phase 00 production layering | Implementation plan, MICRO-041 | REJECTED |
| Initial music/SFX are licensed/imported, rights-linked layers | Phase 00 production layering | Implementation plan, MICRO-041 | ACTIVE |
| Generated music-provider integration | Phase 00 optional capability | Future architecture amendment | DEFERRED |

## Current corpus and constraints

- Corpus: `content-packs/seven-minutes-ahead-content-pack-v4-multilingual/`
- Identity: `seven-minutes-ahead` / `v4-multilingual`
- 100 canonical episodes; 400 localized variants.
- Locales: `en-US`, `de-DE`, `es-ES`, `pt-BR`.
- One language-neutral canon; locale-specific scripts, TTS, timing, subtitles,
  UI text, metadata, and renders.
- Shared visual semantics/assets by default.
- Embedded structured persistence; no PostgreSQL requirement and no Prisma.
- Large artifacts remain hash-addressed outside the embedded store.
- Reuse the existing workflow engine; do not create a second one.
- TikTok uses official APIs only. Publication always needs explicit approval,
  exact account binding, idempotency, and reconciliation.
- Direct Post consumes exact, non-revoked creator-consent/export evidence bound
  to account, creator capability, render, metadata, privacy, interaction
  settings, declarations, and approval timestamp.
- Provider work is budgeted and attributable by episode, locale, provider,
  asset type, and revision; rate-limit/retry evidence is durable.
- Source/provider payloads are untrusted. Prompt injection cannot change canon,
  tools, providers, accounts, approval, or policy.

## Implementation state

Current phase: architecture consolidated; implementation Phase 01 has not
started. The canonical backlog is
`docs/tasks/microdrama/implementation-backlog.json`.

Exactly one task is ready:

`MICRO-001 — Implement @mediaforge/narrative-core contracts and validators`

The next gate is acceptance of the pure Narrative Core package and its focused
tests. No persistence, provider, media, publication, or analytics work belongs
to that task.

Backlog `dependsOn` edges mean code/contract implementation dependencies only.
Runtime evidence is listed separately in `requiredGates`, external conditions in
`externalPrerequisites`, and operator authority in `operatorAuthorization`.
Omitted task-level values inherit the explicit schema-v2 `taskDefaults`.
