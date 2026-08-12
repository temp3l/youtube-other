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
    M004 --> M006[006 Rolling planning]
    M006 --> M007[007 Episode/beat compiler]
    M004 --> M008[008 Story/parity QA]
    M007 --> M008
    M008 --> M009[009 Future-locale pipeline]

    M002 --> M010[010 Visual registry]
    M004 --> M010
    M002 --> M040[040 Cost/quota/observability]
    M005 --> M040
    M002 --> M043[043 Security/trust gates]
    M003 --> M043
    M010 --> M043
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
    M008 --> M019[019 Production QA]
    M018 --> M019
    M041 --> M019
    M043 --> M019

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
    M025 --> M027[027 Direct Post/idempotency]
    M026 --> M027
    M027 --> M028[028 TikTok reconciliation]
    M028 --> M029[029 Scheduling/operator controls]

    M028 --> M030
    M030 --> M031[031 Experiments]
    M006 --> M032[032 Learning admission]
    M008 --> M032
    M031 --> M032

    M004 --> M033[033 EN TTS/timing canary]
    M005 --> M033
    M016 --> M033
    M019 --> M033
    M040 --> M033
    M013 --> M034[034 EN visual canary]
    M019 --> M034
    M033 --> M034
    M017 --> M035[035 Multilingual render canary]
    M034 --> M035
    M035 --> M036[036 E004-E010 production]
    M019 --> M037[037 TikTok private canary]
    M028 --> M037
    M029 --> M037
    M035 --> M037
    M037 --> M038[038 TikTok audited public canary]
    M030 --> M042[042 Provider analytics read canary]
    M037 --> M042
    M042 --> M038
    M036 --> M039[039 Progressive E011+]
    M038 --> M039
    M032 --> M039
```

## Phase boundaries

| Phase | Tasks | Outcome | Calls by default |
|---|---|---|---|
| 01 Narrative foundation | MICRO-001 | Pure IDs, schemas, revisions, canon validators | Local only |
| 02 Embedded state and V4 admission | MICRO-002–005 | Durable embedded authority and admitted V4 corpus/profile | Local only |
| 03 Story planning and QA | MICRO-006–009 | Rolling plans, episode/beat compilation, canon/parity gates | Local/mocked |
| 04 Media planning and production | MICRO-010–019, 040–041, 043 | Registries, security, cost controls, semantic shots, locale audio/timing, rights, composition, QA | Local/mocked until canaries |
| 05 Publication | MICRO-020–029 | Provider-specific durable publication, TikTok official API architecture | Local/mocked |
| 06 Performance and learning | MICRO-030–032 | Revision-linked observations, experiments, canon-safe recommendations | Local/mocked |
| 07 Bounded canaries | MICRO-033–039, 042 | Explicitly authorized staged production/publication and analytics reads | Side effects only per task approval |

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

Add season, arc, near-horizon, EpisodeSpec, BeatPlan, and revision workflows over
accepted snapshots. Deterministic QA owns chronology, knowledge, promise, reveal,
boundary, hook, and localization-parity rules. Future-locale generation remains
after V4 admission and cannot modify supplied revisions.

### 04 — Media planning and production

Add reusable character/location/prop/voice registries; typed Signal UI and
platform safe zones; language-neutral Beat/Scene/Shot identity; shared-visual
cache policy; provider ports; selected-audio measurement/alignment; independent
locale subtitles/UI; typed timeline/composition; and production QA. Provider
integration tasks use mocks until an explicitly authorized canary.

Before canaries, add revision-linked cost/quota attribution and bounded
observability, untrusted-input/artifact trust gates, and separate
licensed/imported ambience/SFX/music tracks with rights evidence. Generated
music remains deferred.

### 05 — Publication

Persist provider-specific intents/effects in the embedded store. Retain YouTube
as a distinct projection. Split TikTok into account/OAuth, secure credential
handles, creator preflight, locale target mappings, metadata, FILE_UPLOAD default
with constrained PULL_FROM_URL, Direct Post, idempotency, reconciliation, and
scheduling/operator controls. Capability remains disabled outside canaries.
Schedule records never authorize unattended or public-API dispatch; initiation
remains operator-controlled under ADR-OPERATIONS-001.
Persist provider correlation IDs and rate-limit/`Retry-After` state; the single
retry owner pauses safely and never converts throttling or ambiguity into a
duplicate mutation.

### 06 — Performance and learning

Ingest immutable provider/account/locale/revision/window observations, normalize
with versioned null-aware definitions, and support controlled experiment records.
Learning produces recommendations only; canon-aware validation and acceptance
are mandatory before future planning consumes them.
Provider adapters and storage are implemented with fixtures first; a separate,
explicitly authorized read-only canary proves live observation ingestion before
any audited public TikTok canary.

### 07 — Bounded rollout

Run separate EN E001–E003 audio/timing and visual canaries, then a shared-visual
DE/ES/PT-BR render canary, then E004–E010. TikTok private and audited public
canaries are separate tasks. E011+ stays blocked until production, publication,
analytics, and learning gates have evidence. No canary task title grants provider
authorization.

## Task status and reporting

- Only MICRO-001 is initially READY because Narrative Core does not exist and
  requires no unresolved implementation dependency.
- Every other task is BLOCKED until all `dependsOn` tasks are DONE and any
  explicit side-effect approval is recorded.
- No task begins IN_PROGRESS through planning alone.
- Required task validation is focused and bounded by repository guardrails.
- Every modifying task creates a concise Codex run report. Work based on this
  plan additionally creates or updates the dated implementation report required
  by `AGENTS.md`.

## Recovery and rollback

Prefer additive packages, migrations, adapters, and capability flags. Disable
task registration/provider capability before rollback; never delete accepted
revisions or immutable provenance. Embedded migrations require backup and
forward-repair procedures. Provider ambiguity is reconciled, not rolled back by
issuing another effect.
