# MICRO-033 authorization pack (preflight only)

Date: 2026-08-12  
Task: MICRO-033 — Run EN E001–E003 TTS and timing canary  
Verdict: **BLOCKED** (operator dispatch prerequisites remain)

No TTS, paid, or external provider calls were made.

## Backlog verification

| Metric | Expected | Repository |
|--------|----------|------------|
| DONE | 41 | 41 |
| BLOCKED | 9 | 9 |
| READY | 0 | 0 |
| IN_PROGRESS | 0 | 0 |

Phase-07 blocked: MICRO-033, 034, 035, 036, 037, 038, 039, 042, 050. MICRO-033 remains **BLOCKED**.

## Scope

- Episodes: E001, E002, E003
- Locale: en-US
- Pack: `content-packs/seven-minutes-ahead-content-pack-v5-remediated`

## Script revisions (admitted V5)

| Episode | scriptRevisionId | localizedMasterStoryContentHash | pack file SHA-256 |
|---------|------------------|-----------------------------------|-------------------|
| E001 | `rev.script.en-us.e001` | `81078652…f64669` | `f5403a5d…b31e6` |
| E002 | `rev.script.en-us.e002` | `f6f6d234…d2f49` | `43aad004…01ef1` |
| E003 | `rev.script.en-us.e003` | `0f0b2983…a78727` | `c658e314…e5948` |

Canon linkage per episode: `rev.episode-spec.*`, `rev.beat-plan.*`, `rev.boundary.*`, audio target `rev.audio-tts.rev.script.en-us.*.en-us`.

Story/script readiness uses admitted script `contentHash` from pack manifest; audio readiness binds `localizedMasterStoryContentHash` from extracted master-story text (ADR-004 selected-audio timing).

## Gates (provider-free evaluation)

| Gate | Status |
|------|--------|
| STORY_SCRIPT_READY | PASS |
| AUDIO_TTS_READY | PASS |
| ASSET_GENERATION_APPROVED | NOT_YET_AUTHORIZED |
| COST_BUDGET_APPROVED | TO_BE_APPROVED (local cost proposal ready; no durable operator approval) |

Validated via `evaluateEnE001E003TtsCanaryPreflight` without operator authorization (blocks on `operator_authorization_missing`).

## Voice revision

- Resolved profile version: `voice-version.narrator.en-us.v1` (`voice.character.narrator.en-us`)
- Local registration module: `packages/microdrama/src/seven-minutes-ahead-narrator-voice-registry.ts`
- Persisted `CharacterVoiceProfile` in production persistence: **MISSING**
- Provider voice candidate `alloy`: **UNBOUND** — registry requires `CANARY_APPROVED` + evidence hash before provider voice IDs dispatch

**PERSIST_VOICE_PROFILE_AND_OPERATOR_VOICE_BINDING**

## Provider configuration

Candidate (readiness fixture + local registry definition):

| Field | Value |
|-------|-------|
| provider | `openai` |
| model | `tts-1-hd` |
| voice (candidate) | `alloy` |
| speed | `1` |
| instructions | `Measured pacing for microdrama.` |
| configuration hash | `a5b5a465a3c8cb33cb71467421e0e7d9471143342cecbb88511e5c9ff2a967e9` |

No operator-approved bounded configuration is recorded in durable approvals.

**PROVIDER_CONFIGURATION_REQUIRED**

## External prerequisites

| Prerequisite | Status |
|--------------|--------|
| Approved TTS provider account | MISSING |
| Credential handle (opaque) | null — admission contract ready in domain |
| Bounded E001–E003 voice/provider config | PARTIAL (local module + fixture) |

## Timing policy (en-US)

- Lexical target: **155 WPM** (`packages/microdrama/src/v5-production-profile.ts`)
- Lexical soft limits: 145–160 words, 56–62 s estimated duration
- AUDIO_GATE: **UNCALIBRATED** (soft/hard duration null); selected audio is timing authority
- MICRO-033 goal: calibrate AUDIO_GATE from measured canary evidence

## Candidate strategy

- One naturalness candidate **per episode** (canary selection outcome)
- **37** initial segment syntheses total (E001: 10, E002: 12, E003: 15) — locale TTS segmentation issues one request per paragraph; EN scripts use inline dialogue, not `SPEAKER:` prefixes

## Retry ownership

- Owner: `SpeechGenerationService` (`maximumAttempts` default **3**, `retryBaseDelayMs` **500**)
- ADR-SPEECH-003: chunk-level bounded exponential backoff; no silent provider fallback
- Ambiguous post-dispatch: no blind retry; replacement requires explicit `supersedesGenerationId`
- SDK-level OpenAI retries: not separately configured for microdrama bounded canary path

## Request ceiling (proposal)

| Field | Value |
|-------|-------|
| initialProviderSyntheses | 37 |
| maximumRetriesPerSynthesis | 2 |
| maximumTotalProviderRequests | 111 |

## Cost ceiling (proposal)

| Field | Value |
|-------|-------|
| Pricing revision | `microdrama.openai-tts.planning.v1` |
| Source | `packages/microdrama/src/microdrama-openai-tts-pricing-catalog.ts` |
| Billable characters | 2543 |
| Expected base cost | **51** minor (USD, $0.5086) |
| Retry reserve | **148** minor (74 extra requests × ~2 minor/request) |
| Proposed maximum | **199** minor (USD) |
| Repository preflight default | 120 minor / episode (planning estimate only) |

Operator must still issue durable `COST_BUDGET_APPROVED` evidence matching the proposed ceiling.

## Local prerequisites implemented (this session)

1. Narrator voice registry seed (`seven-minutes-ahead-narrator-voice-registry.ts` + unit test)
2. OpenAI TTS planning pricing catalog (`microdrama-openai-tts-pricing-catalog.ts` + unit test)
3. Speech credential admission contracts/lifecycle (`microdrama-speech-credential-*` in domain + unit test)

## Approvals to create (templates in JSON artifact)

1. `microdrama-asset-generation-approval.v1` — TTS + alignment only; scope binds `voice-version.narrator.en-us.v1`, cost limit **199** minor
2. `microdrama-operator-authorization.v1` — `BOUNDED_PAID_PROVIDER_EFFECT` with same bindings
3. Durable budget reservation matching `COST_BUDGET_APPROVED` evidence
4. Opaque OpenAI credential handle via `microdrama-speech-credential.v1` admission

## Preflight command (no dispatch)

```bash
pnpm test:focused -- packages/microdrama/src/en-e001-e003-tts-canary-preflight.unit.test.ts
```

API: `evaluateEnE001E003TtsCanaryPreflight` (`@mediaforge/microdrama`).

## Blockers before operator approval

1. Persist en-US narrator voice profile via MICRO-015 persistence (`registerSevenMinutesAheadNarratorVoiceProfile`)
2. Operator selects provider voice and records canary-approved binding if using concrete OpenAI voice
3. Register opaque OpenAI TTS credential handle / approved provider account
4. Issue asset-generation approval, operator authorization, and cost-budget approval (199 minor USD proposed)
5. Re-run preflight with approvals attached; still **do not dispatch** until explicit execute step

## Artifacts

- Machine-readable: `docs/reports/codex-runs/2026-08-12-micro-033-authorization-pack.json`
- This report

## Calls

External: 0 | Paid: 0 | Publication: 0
