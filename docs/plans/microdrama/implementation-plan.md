# Vertical Microdrama Factory implementation plan

Date: 2026-08-12
Status: ACTIVE
Backlog: `docs/tasks/microdrama/implementation-backlog.json`

## Objective and execution rule

Implement a provider-independent serialized microdrama system using one typed
narrative canon, embedded structured persistence, hash-addressed large artifacts,
locale-specific production projections, and approval-gated provider effects.

Execute exactly one READY backlog task at a time. A task becomes DONE only when
its scope and acceptance criteria are complete, focused validation passes, the
required report exists, and no blocker remains. Architecture conflicts block the
task until an ADR/plan amendment and backlog update are approved.

## Invariants

- No PostgreSQL requirement or Prisma for new microdrama state.
- Reuse the existing workflow engine; do not add a second workflow engine.
- Narrative Core has no persistence, provider, media, publication, or analytics I/O.
- Large artifacts stay outside SQLite and are referenced by immutable hashes.
- V4 is one 100-episode canon with 400 supplied locale ScriptRevisions.
- Selected locale audio and alignment determine final production timing.
- Shared visual semantics/assets are the default across locales.
- Provider calls, paid calls, and publication calls require task-specific policy
  and explicit operator authorization; backlog eligibility is not authorization.
- TikTok uses official APIs only and ambiguous effects reconcile instead of
  blindly retrying.
- `STORY_APPROVED`, `ASSET_GENERATION_APPROVED`, and `PUBLICATION_APPROVED`
  bind exact revisions and cannot be bypassed by force/retry/resume.
- `dependsOn` expresses implementation dependencies only. Runtime approvals,
  provider/account state, budgets and policy are separate `requiredGates`,
  `externalPrerequisites`, and `operatorAuthorization` conditions.
- Untrusted source/provider payloads cannot alter canon, tools, providers,
  accounts, policy, or approval. Artifact MIME/hash/URL and redaction gates fail
  closed.

## Implementation DAG

```mermaid
flowchart TD
    M001[001 Narrative Core] --> M002[002 Embedded store]
    M001 --> M003[003 V4 parser/validation]
    M002 --> M004[004 V4 narrative admission]
    M003 --> M004
    M003 --> M005[005 Series/locale profiles]
    M004 --> M006[006 Future rolling planning]
    M004 --> M007[007 Imported V4 episode/beat admission]
    M005 --> M007
    M004 --> M008[008 Story/parity QA]
    M007 --> M008
    M006 --> M044[044 Rolling-plan episode/beat compiler]
    M007 --> M044
    M008 --> M044
    M008 --> M009[009 Future-locale pipeline]

    M002 --> M010[010 Visual registry]
    M004 --> M010
    M002 --> M040[040 Cost/quota/observability]
    M005 --> M040
    M002 --> M043[043 Security/trust gates]
    M003 --> M043
    M005 --> M011[011 Signal UI/safe zones]
    M007 --> M012[012 Scene/shot compiler]
    M010 --> M012
    M012 --> M013[013 Shared image integration]
    M012 --> M014[014 Video-generation port]
    M002 --> M015[015 Voice registry]
    M005 --> M015
    M007 --> M016[016 TTS/alignment timing]
    M015 --> M016
    M011 --> M017[017 Localized subtitles/UI]
    M016 --> M017
    M012 --> M018[018 Timeline/composition]
    M013 --> M018
    M016 --> M018
    M017 --> M018
    M018 --> M041[041 Licensed audio/rights]
    M002 --> M041
    M002 --> M019[019 Readiness evidence framework]
    M005 --> M019
    M004 --> M045[045 Story/script readiness]
    M007 --> M045
    M008 --> M045
    M019 --> M045
    M043 --> M045
    M015 --> M046[046 Audio/TTS readiness]
    M016 --> M046
    M019 --> M046
    M040 --> M046
    M043 --> M046
    M045 --> M046
    M010 --> M047[047 Visual/render readiness]
    M011 --> M047
    M012 --> M047
    M013 --> M047
    M014 --> M047
    M017 --> M047
    M018 --> M047
    M019 --> M047
    M041 --> M047
    M043 --> M047
    M045 --> M047
    M046 --> M047

    M002 --> M020[020 Publication domain]
    M005 --> M020
    M040 --> M020
    M043 --> M020
    M020 --> M021[021 YouTube coexistence]
    M020 --> M022[022 TikTok account/OAuth]
    M022 --> M023[023 Secure credentials]
    M023 --> M024[024 Creator preflight/targets]
    M020 --> M025[025 TikTok metadata]
    M024 --> M026[026 TikTok transfer]
    M020 --> M049[049 TikTok app/audit evidence]
    M022 --> M049
    M023 --> M049
    M025 --> M049
    M025 --> M027[027 Direct Post/idempotency]
    M026 --> M027
    M049 --> M027
    M027 --> M028[028 TikTok reconciliation]
    M028 --> M029[029 Scheduling/operator controls]
    M019 --> M048[048 Publication readiness]
    M020 --> M048
    M024 --> M048
    M025 --> M048
    M027 --> M048
    M028 --> M048
    M029 --> M048
    M040 --> M048
    M043 --> M048
    M047 --> M048
    M049 --> M048
    M024 --> M050[050 Read-only OAuth/creator canary]
    M049 --> M050

    M020 --> M030
    M030 --> M031[031 Experiments]
    M006 --> M032[032 Learning admission]
    M008 --> M032
    M044 --> M032
    M031 --> M032

    M046 --> M033[033 EN TTS/timing canary]
    M047 --> M034[034 EN visual canary]
    M033 --> M034
    M047 --> M035[035 Multilingual render canary]
    M034 --> M035
    M035 --> M036[036 E004-E010 production]
    M048 --> M037[037 TikTok private canary]
    M050 --> M037
    M035 --> M037
    M037 --> M038[038 TikTok audited public canary]
    M030 --> M042[042 Public-video analytics read canary]
    M038 --> M042
    M036 --> M039[039 Progressive E011+]
    M038 --> M039
    M042 --> M039
    M032 --> M039
```

## Phase boundaries

| Phase | Tasks | Outcome | Calls by default |
|---|---|---|---|
| 01 Narrative foundation | MICRO-001 | Pure IDs, schemas, revisions, canon validators | Local only |
| 02 Embedded state and V4 admission | MICRO-002–005 | Durable embedded authority and admitted V4 corpus/profile | Local only |
| 03 Story planning and QA | MICRO-006–009, 044 | Imported-V4 admission independent of future rolling planning, plus canon/parity gates | Local/mocked |
| 04 Media planning and production | MICRO-010–019, 040–041, 043, 045–047 | Registries, security, cost controls, locale audio/timing, composition, and composable readiness | Local/mocked until canaries |
| 05 Publication | MICRO-020–029, 048–049 | Provider-specific publication, exact consent, scheduling modes, and TikTok app/audit evidence | Local/mocked |
| 06 Performance and learning | MICRO-030–032 | Revision-linked observations, experiments, canon-safe recommendations | Local/mocked |
| 07 Bounded canaries | MICRO-033–039, 042, 050 | Explicitly authorized staged production/publication and read-only provider checks | Side effects only per task approval |

## Phase requirements

### 01 — Narrative Core

Create `@mediaforge/narrative-core` with branded IDs, runtime schemas, revision
envelope/state, SeriesBible, Character/CharacterState, directional relationships,
secrets, knowledge, promises, snapshots, and deterministic validators. Keep it
generic: no `7 MINUTES AHEAD`, WPM, locales, Signal, providers, persistence, or I/O.

### 02 — Embedded state and V4 admission

Add SQLite repositories and migrations for narrative/import/profile state behind
ports. Build a fail-closed V4 parser/hash validator, then compile shared canon
evidence and 400 imported script revisions into one 100-episode identity graph.
Persist BCP-47 locale profiles and separate lexical/audio timing policies. Media
generation is out of scope.

### 03 — Story planning and QA

Compile existing imported V4 scripts and canonical boundaries directly into
production `EpisodeSpec`/`BeatPlan` projections. This admission path does not
require the future rolling planner and cannot generate or rewrite scripts.
Separately add season, arc, near-horizon and current-episode planning for future
revisions, reusing the same contracts. Deterministic QA owns chronology,
knowledge, promise, reveal, boundary, hook, and localization-parity rules.

### 04 — Media planning and production

Add reusable character/location/prop/voice registries; typed Signal UI and
platform safe zones; language-neutral Beat/Scene/Shot identity; shared-visual
cache policy; provider ports; selected-audio measurement/alignment; independent
locale subtitles/UI; typed timeline/composition; and production QA. Provider
integration tasks use mocks until an explicitly authorized canary.

Implement one readiness-evidence framework with independent story/script,
audio/TTS, and visual/render evaluators. These are admission semantics in
existing packages, not reasons to create new packages. An audio canary requires
story/audio readiness but not visual generation, composition, music/SFX, or
render QA.

Before canaries, add revision-linked cost/quota attribution and bounded
observability, untrusted-input/artifact trust gates, and separate
licensed/imported ambience/SFX/music tracks with rights evidence. Generated
music remains deferred.

### 05 — Publication

Persist provider-specific intents/effects in the embedded store. Retain YouTube
as a distinct projection. Split TikTok into account/OAuth, secure credential
handles, creator preflight, locale target mappings, metadata, FILE_UPLOAD default
with constrained PULL_FROM_URL, Direct Post, idempotency, reconciliation, and
scheduling/operator controls. Persist exact creator-consent/export revisions and
TikTok app/audit-readiness evidence. Publication readiness is evaluated
independently from story/audio/visual readiness.

Support `MANUAL` and disabled-by-default `PREAPPROVED_SCHEDULED`. In the latter,
the operator consents to one exact post intent when scheduling; dispatch needs no
fresh click but revalidates every account, OAuth, capability, hash, policy,
declaration, consent and approval fence and blocks on any material change.
Persist provider correlation IDs and rate-limit/`Retry-After` state; the single
retry owner pauses safely and never converts throttling or ambiguity into a
duplicate mutation.

### 06 — Performance and learning

Ingest immutable provider/account/locale/revision/window observations, normalize
with versioned null-aware definitions, and support controlled experiment records.
Learning produces recommendations only; canon-aware validation and acceptance
are mandatory before future planning consumes them.
Provider adapters and storage are implemented with fixtures first. Basic video
read counters are not called retention metrics. Missing official fields remain
unavailable, never zero. Because SELF_ONLY/private posts may not be exposed by
the authorized read API, the live analytics canary follows the first audited
public post (or targets a separately authorized existing public video).

### 07 — Bounded rollout

Run separate EN E001–E003 audio/timing and visual canaries, then a shared-visual
DE/ES/PT-BR render canary, then E004–E010. TikTok private and audited public
canaries are separate tasks. E011+ stays blocked until production, publication,
analytics, and learning gates have evidence. A bounded OAuth/creator-info canary
validates exact account identity, token refresh, scopes and creator capability
without upload or publication before the first publication mutation. No canary
task title grants provider authorization.

## Task status and reporting

- Only MICRO-001 is initially READY because Narrative Core does not exist and
  requires no unresolved implementation dependency.
- Every other task is BLOCKED until all `dependsOn` tasks are DONE and all
  applicable runtime gates, external prerequisites and operator authorization
  are recorded. These conditions do not become DAG edges.
- No task begins IN_PROGRESS through planning alone.
- Required task validation is focused and bounded by repository guardrails.
- Backlog validation checks unique/resolved IDs, acyclicity, effective schema
  defaults, valid blocked reasons, and exactly one READY task (`MICRO-001`).
- Every modifying task creates a concise Codex run report. Work based on this
  plan additionally creates or updates the dated implementation report required
  by `AGENTS.md`.

## Recovery and rollback

Prefer additive packages, migrations, adapters, and capability flags. Disable
task registration/provider capability before rollback; never delete accepted
revisions or immutable provenance. Embedded migrations require backup and
forward-repair procedures. Provider ambiguity is reconciled, not rolled back by
issuing another effect.
