# Codex Prompt — Implement Provider-Neutral Speech Generation with ElevenLabs

## Role

Act as a principal TypeScript platform engineer responsible for a production media-generation system.

Implement a provider-neutral speech-generation subsystem that supports the existing OpenAI TTS provider and adds ElevenLabs cloned-voice synthesis.

The implementation must be secure, observable, deterministic where possible, auditable, testable, and reusable from the API, CLI, automated episode workflows, and frontend.

Do not introduce a second parallel speech-generation path. Refactor existing behavior behind one shared application layer.

---

## Repository context

This repository is the existing YouTube/media-production platform.

Known requirements:

- OpenAI TTS is already implemented.
- ElevenLabs must be added through a common provider interface.
- A speech profile is selected primarily per genre.
- A video may explicitly override its genre speech profile.
- Initially, one ElevenLabs cloned voice will be used for all configured languages.
- Voice/profile settings must be immutable and versioned.
- Identical synthesis inputs should reuse cached audio.
- Operators must be able to force regeneration.
- Failed ElevenLabs generation must not silently fall back to OpenAI or another voice.
- Cost estimates, quotas, and actual usage must be recorded.
- Narration text may be sent directly to the configured provider.
- No subtitle or word-alignment feature is required.
- API, CLI, workflows, and frontend must use the same application service.
- Existing OpenAI behavior must continue to work after the refactor.

Do not hard-code the solution to one person or one genre. The first cloned-voice profile may be configured for the `veronicaBenini` genre, but the implementation must remain generic.

---

# Primary objective

Implement a production-grade speech subsystem with:

1. A shared provider contract.
2. An OpenAI provider adapter around the existing implementation.
3. A new ElevenLabs provider adapter.
4. Versioned voice profiles.
5. Genre defaults and video-level overrides.
6. Deterministic cache-key generation.
7. Concurrency-safe cache reuse.
8. Explicit generation states and retry semantics.
9. Cost estimation and quota enforcement.
10. Canonical audio post-processing.
11. Consent metadata enforcement.
12. API, CLI, workflow, and frontend integration.
13. Security, metrics, structured logging, and tracing.
14. Comprehensive tests and operational documentation.

---

# Mandatory working method

## 1. Inspect before changing

First inspect the repository and identify:

- Existing OpenAI TTS implementation.
- Existing speech/audio domain models.
- Current CLI speech/audio commands.
- Episode workflow/task execution model.
- Genre configuration model.
- Video/episode configuration model.
- Artifact storage abstraction.
- Database and migration tooling.
- Queue, worker, retry, and idempotency mechanisms.
- Logging, metrics, and tracing conventions.
- API framework and contract conventions.
- Frontend framework and configuration forms.
- Existing feature flag system.
- Existing workflow log or episode execution journal.
- Existing secrets/configuration conventions.
- Existing tests and fixtures.

Document the discovered current state before implementation.

## 2. Reuse existing infrastructure

Prefer existing abstractions for:

- database transactions;
- queues;
- distributed locks or leases;
- artifact storage;
- feature flags;
- structured errors;
- logging;
- metrics;
- tracing;
- schema validation;
- API contracts;
- configuration;
- secrets;
- workflow state.

Do not create competing infrastructure when an existing repository abstraction can be extended.

## 3. Eliminate duplicate execution paths

All speech generation must converge on one application service.

The following entry points must call the same service:

- API;
- CLI;
- automated episode workflow;
- frontend-triggered actions.

Do not leave the legacy OpenAI path reachable independently after migration, except through a short-lived compatibility wrapper with a documented removal plan.

## 4. Work in safe batches

Use parallel agents only for independent repository analysis, test design, documentation, frontend work, or adapter implementation that does not overlap file ownership.

Do not let parallel agents edit the same files.

Recommended sequence:

1. repository discovery;
2. architecture and migration plan;
3. shared contracts;
4. OpenAI adapter migration;
5. persistence and migrations;
6. cache/state/quota orchestration;
7. ElevenLabs adapter;
8. audio post-processing;
9. API/CLI/workflow integration;
10. frontend integration;
11. observability and security hardening;
12. tests;
13. documentation;
14. final audit.

Commit or checkpoint after each independently verifiable batch if the environment supports it.

---

# Required architecture

Implement the following conceptual structure using repository-native naming and folders:

```text
API / CLI / Workflow / Frontend
              |
              v
      SpeechGenerationService
              |
      +-------+--------+
      |                |
ProfileResolver     CostGuard
      |                |
      +-------+--------+
              |
              v
       SpeechProviderRegistry
          |             |
          v             v
 OpenAiSpeechProvider  ElevenLabsSpeechProvider
          |             |
          +------+------+
                 |
                 v
     AudioPostProcessingService
                 |
                 v
       Artifact Store + Audit Log
```

Provider adapters must only contain provider-specific API translation and response handling.

The orchestration layer must own:

- profile resolution;
- consent validation;
- cost preflight;
- quota checks;
- cache lookup;
- concurrency control;
- state transitions;
- retries;
- post-processing;
- artifact persistence;
- audit records;
- metrics and logging.

---

# Provider selection rules

Resolve the effective speech profile in this exact order:

```text
video-specific profile override
    -> genre default profile
    -> system default OpenAI profile
```

Rules:

- A video override references a versioned profile.
- A genre default references a versioned profile.
- The system default must remain OpenAI unless explicitly reconfigured.
- Never silently switch provider or voice after generation begins.
- Never use ElevenLabs as an implicit fallback.
- Never use OpenAI as an implicit fallback for failed cloned-voice generation.
- An operator may explicitly create a replacement generation with another profile.
- Explicit replacements must preserve lineage through `supersedesGenerationId` or the repository-equivalent field.

---

# Shared provider contract

Implement a strongly typed discriminated contract equivalent to the following.

Adapt naming to repository conventions, but preserve the semantics.

```ts
export type SpeechProviderId = 'openai' | 'elevenlabs';

export interface VoiceSettings {
  readonly speed: number;
}

export interface ElevenLabsVoiceSettings extends VoiceSettings {
  readonly stability: number;
  readonly similarityBoost: number;
  readonly style: number;
  readonly useSpeakerBoost: boolean;
}

export type SpeechProviderConfiguration =
  | {
      readonly provider: 'openai';
      readonly model: string;
      readonly voice: string;
      readonly instructions?: string;
      readonly outputFormat?: string;
    }
  | {
      readonly provider: 'elevenlabs';
      readonly modelId: string;
      readonly voiceId: string;
      readonly settings: ElevenLabsVoiceSettings;
      readonly pronunciationDictionaryVersions: readonly string[];
      readonly outputFormat: string;
    };

export interface ResolvedSpeechProfile {
  readonly profileId: string;
  readonly profileVersionId: string;
  readonly language: string;
  readonly configuration: SpeechProviderConfiguration;
}

export interface SpeechSynthesisRequest {
  readonly generationId: string;
  readonly text: string;
  readonly profile: ResolvedSpeechProfile;
  readonly forceRegeneration: boolean;
  readonly abortSignal?: AbortSignal;
}

export interface SpeechCostEstimate {
  readonly billableCharacters: number;
  readonly estimatedCredits?: number;
  readonly estimatedCurrencyAmount?: number;
  readonly currency?: string;
}

export interface ProviderSpeechResult {
  readonly providerRequestId?: string;
  readonly rawAudio: NodeJS.ReadableStream;
  readonly rawContentType: string;
  readonly actualBillableCharacters?: number;
  readonly actualCredits?: number;
  readonly seed?: number;
}

export interface SpeechProvider {
  readonly id: SpeechProviderId;

  validateProfile(profile: ResolvedSpeechProfile): Promise<void>;

  estimate(
    request: SpeechSynthesisRequest,
  ): Promise<SpeechCostEstimate>;

  synthesize(
    request: SpeechSynthesisRequest,
  ): Promise<ProviderSpeechResult>;
}
```

Requirements:

- Use discriminated unions.
- Do not use `any`.
- Use `unknown` at external boundaries and validate before use.
- Validate persisted JSON and API payloads with the repository's runtime schema library.
- Do not use enums for remote provider model IDs or voice IDs.
- Keep domain contracts independent of provider SDK types.
- Wrap provider SDKs or HTTP clients behind adapters.
- Make cancellation and timeouts explicit.
- Avoid buffering entire large audio responses in memory where streaming is possible.

---

# Voice profiles and immutable versions

Implement a logical profile and immutable version model.

Required concepts:

```text
VoiceProfile
  id
  key
  displayName
  consentRecordId
  status

VoiceProfileVersion
  id
  voiceProfileId
  version
  provider
  configurationJson
  createdAt
  activatedAt
  deprecatedAt

GenreSpeechPolicy
  genreId
  defaultVoiceProfileVersionId

VideoSpeechOverride
  videoId
  voiceProfileVersionId
```

Required lifecycle:

```text
DRAFT -> ACTIVE -> DEPRECATED
```

Rules:

- Active profile versions are immutable.
- Any settings change creates a new version.
- A generation stores the exact `voiceProfileVersionId`.
- A version cannot be activated unless its provider configuration validates.
- A cloned-voice version cannot be activated unless valid consent metadata exists.
- Existing generations retain their original profile version even after deprecation.
- Deleting an in-use profile version must be prohibited.
- Prefer soft deletion or deprecation over physical deletion.

Add database constraints and indexes for:

- unique profile key;
- unique profile version number per logical profile;
- only valid profile references;
- genre lookup;
- video override lookup;
- generation lookup by profile version.

---

# Consent metadata

Represent cloned-voice consent explicitly.

Required fields or semantic equivalents:

```text
VoiceConsentRecord
  id
  subjectName
  evidenceArtifactId
  evidenceSha256
  syntheticSpeechAllowed
  commercialUseAllowed
  multilingualUseAllowed
  permittedChannels
  validFrom
  validUntil
  revokedAt
```

Enforcement:

- A cloned voice cannot become active without valid consent.
- Consent must cover synthetic speech, commercial use, multilingual use, and configured channels.
- Revoked or expired consent prevents new generations.
- Historical records remain auditable.
- Do not expose sensitive evidence in normal API responses or logs.
- Record consent validation results in generation audit metadata without logging the evidence itself.

---

# ElevenLabs initial profile defaults

Provide a seed configuration for the first multilingual cloned-voice profile.

Use configuration values equivalent to:

```yaml
provider: elevenlabs
modelId: eleven_multilingual_v2
outputFormat: mp3_44100_128

settings:
  stability: 0.65
  similarityBoost: 0.80
  style: 0
  useSpeakerBoost: true
  speed: 1.0

textNormalization: auto

chunking:
  targetCharacters: 4000
  hardMaximumCharacters: 8000
  previousContextCharacters: 400
  nextContextCharacters: 400
```

Treat these values as configurable profile data, not constants embedded in provider code.

Add a fixture or seed example for a genre profile such as:

```yaml
genre: veronicaBenini
speech:
  defaultProfile: veronica-elevenlabs-main-v1
```

Do not require that this seed be activated automatically in production.

---

# Long-form chunking

Implement semantic chunking for long narration.

Priority:

1. paragraph boundary;
2. sentence boundary;
3. clause boundary only as a final fallback.

Required model:

```ts
interface SpeechChunk {
  readonly index: number;
  readonly text: string;
  readonly previousContext?: string;
  readonly nextContext?: string;
}
```

Requirements:

- Enforce provider-specific request limits.
- Use target and hard maximum character limits from profile/provider policy.
- Preserve punctuation and Unicode.
- Provide limited previous and next context where supported.
- Generate chunks sequentially within a single video unless repository evidence proves parallel generation preserves voice continuity.
- Permit separate videos to generate concurrently.
- Persist chunk-level provider request IDs and outcomes.
- Retry only failed chunks when safe.
- Concatenate chunks in deterministic order.
- Validate that no text is lost or duplicated during splitting.
- Add property-based or fixture-based tests for chunk boundaries.

---

# Audio artifact policy

Persist both raw and canonical artifacts.

## Raw provider artifact

Store unchanged provider output for audit and troubleshooting.

Example path:

```text
speech/raw/{generationId}/{chunkIndex}.mp3
```

Use the repository's artifact abstraction rather than direct filesystem coupling.

## Canonical narration master

Use:

```yaml
format: FLAC
sampleRate: 48000
channels: 1
sampleFormat: signed 16-bit PCM
loudness:
  integrated: -16 LUFS
  truePeakMaximum: -1.5 dBTP
```

Processing pipeline:

```text
provider audio
-> decode
-> concatenate chunks
-> resample to 48 kHz mono
-> two-pass loudness normalization
-> encode lossless FLAC
```

Rules:

- Prefer existing FFmpeg/process abstractions.
- Invoke external binaries safely without shell interpolation.
- Validate process exit codes.
- Capture bounded stderr for diagnostics.
- Do not log secrets or full narration.
- Use temporary files/directories with cleanup in success and failure cases.
- Do not automatically remove normal internal silence.
- Only remove clearly abnormal leading/trailing padding with conservative thresholds, if the repository already supports safe trimming.
- Store mastering profile version in metadata and cache keys.
- No subtitle, timestamp, or alignment generation is required.

For the final rendered video mix, document the recommended target:

```yaml
format: AAC-LC
sampleRate: 48000
channels: stereo
bitrate: 192 kbps
targetLoudness: approximately -14 LUFS
truePeakMaximum: -1 dBTP
```

Do not force final-video mix changes outside the relevant renderer boundary unless required for integration.

---

# Cache and reproducibility

Create a canonical cache key from every input that can affect output.

Equivalent inputs:

```ts
const cacheKey = sha256(
  canonicalJson({
    text: normalizeUnicodeNfc(request.text),
    language: request.profile.language,
    provider: configuration.provider,
    model: getModelId(configuration),
    voice: getVoiceId(configuration),
    settings: getVoiceSettings(configuration),
    pronunciationDictionaryVersions:
      getPronunciationDictionaryVersions(configuration),
    outputFormat: getOutputFormat(configuration),
    profileVersionId: request.profile.profileVersionId,
    audioMasteringProfileVersion: AUDIO_MASTERING_PROFILE_VERSION,
  }),
);
```

Rules:

- Normalize text to Unicode NFC.
- Do not strip punctuation.
- Do not normalize numbers.
- Do not remove meaningful whitespace.
- Serialize cache-key input canonically with stable object-key ordering.
- Store the cache-key input schema version.
- Store the final hash with a unique database constraint.
- Cache hits must reuse the canonical master artifact.
- Cache hits incur zero new provider cost.
- `--force` creates a new generation lineage but does not overwrite historical cached artifacts.
- Provider seed is not sufficient for reproducibility; persisted artifacts are authoritative.

## Concurrency safety

Guarantee that concurrent identical requests result in at most one provider call.

Use repository-native mechanisms such as:

- unique database constraint;
- transactional insert/claim;
- distributed lock;
- lease;
- advisory lock;
- queue deduplication.

Required behavior:

- One worker becomes the generation owner.
- Other workers wait, subscribe, or reuse the successful artifact.
- A crashed owner can be recovered after a bounded lease/timeout.
- No permanent deadlock.
- Add integration tests for concurrent identical requests.

---

# Generation state machine

Implement explicit generation states:

```text
QUEUED
  -> PREFLIGHT
  -> GENERATING
  -> POST_PROCESSING
  -> SUCCEEDED
```

Failure and terminal states:

```text
RETRYABLE_FAILURE
BLOCKED_QUOTA
BLOCKED_CONFIGURATION
BLOCKED_CONSENT
FAILED_PERMANENT
CANCELLED
```

Rules:

- Validate state transitions centrally.
- Persist timestamps for each transition.
- Persist structured failure codes.
- Do not store full narration in failure metadata.
- Retain provider request IDs where available.
- Support cancellation through the repository's worker model.
- Prevent completed generations from being mutated.

Retry automatically only for:

- transient network failures;
- timeouts;
- rate limits;
- provider 5xx failures;
- explicitly classified temporary provider errors.

Do not automatically retry:

- authentication failures;
- invalid voice IDs;
- invalid models;
- missing consent;
- unsupported language;
- provider content rejection;
- hard quota exhaustion;
- permanent configuration errors.

Use exponential backoff with jitter and a bounded retry count.

No silent provider fallback is allowed.

---

# Cost estimation, quotas, and usage ledger

Implement cost preflight and actual usage tracking.

Required scopes:

```yaml
provider:
  monthlyHardLimit: configurable

genre:
  monthlyHardLimit: configurable

generation:
  maximumCharacters: configurable
```

Required behavior:

- warning threshold at 80%;
- hard rejection at 100%;
- estimate before provider invocation;
- display estimated characters and cost for batch generation;
- record actual provider usage after completion;
- report cache hits as zero provider cost;
- pricing configuration versioned and updateable without deployment;
- estimated values are advisory;
- actual provider usage is used for reconciliation.

Suggested ledger fields:

```text
provider
genreId
videoId
generationId
billingPeriod
inputCharacters
billableCharacters
estimatedCredits
actualCredits
estimatedCurrencyAmount
actualCurrencyAmount
currency
pricingVersion
cacheHit
providerRequestId
createdAt
```

Handle the race between concurrent quota checks and provider usage safely.

Use transactions or reservation records so parallel jobs cannot exceed the configured hard limit.

If actual provider usage exceeds the estimate, reconcile safely and expose the difference.

---

# Provider-specific adapter requirements

## OpenAI adapter

- Move the existing OpenAI implementation behind `SpeechProvider`.
- Preserve existing voice, model, output, and behavior unless a documented bug requires correction.
- Add regression tests before changing behavior.
- Keep provider SDK types inside the adapter.
- Map provider errors into domain error codes.
- Stream audio where possible.
- Ensure the refactor does not alter current CLI/workflow output paths unexpectedly.

## ElevenLabs adapter

Implement:

- provider authentication;
- voice and model validation;
- text-to-speech request;
- voice settings;
- output format;
- pronunciation dictionary version references;
- previous/next context where supported;
- provider request ID capture;
- cost/character metadata capture where available;
- request timeout;
- abort support;
- response streaming;
- retry classification;
- rate-limit classification;
- structured provider errors.

Configuration:

```text
ELEVENLABS_API_KEY
ELEVENLABS_BASE_URL optional
ELEVENLABS_REQUEST_TIMEOUT_MS
ELEVENLABS_FEATURE_ENABLED
```

Rules:

- The API key is backend-only.
- Never expose it through API responses, frontend bundles, CLI output, logs, or workflow logs.
- Load it through the existing secret/configuration system.
- Prefer Azure Key Vault or the repository's existing production secret provider.
- Validate configuration at application startup.
- ElevenLabs must be feature-flagged.
- Feature-disabled behavior must produce a clear configuration error, not fallback.

Avoid provider SDK lock-in if a small typed HTTP adapter is more maintainable in the repository.

---

# API integration

Expose repository-conventional equivalents of:

```text
POST /v1/speech/estimates
POST /v1/speech/generations
GET  /v1/speech/generations/:generationId
POST /v1/speech/generations/:generationId/retry
POST /v1/speech/generations/:generationId/cancel

GET  /v1/speech/profiles
POST /v1/speech/profiles
POST /v1/speech/profiles/:profileId/versions
POST /v1/speech/profile-versions/:versionId/activate

PUT  /v1/genres/:genreId/speech-policy
PUT  /v1/videos/:videoId/speech-override
```

Requirements:

- Follow existing authentication and authorization conventions.
- Tenant-scope all records if the platform is multi-tenant.
- Add optimistic concurrency or version checks for mutable policies.
- Require idempotency keys for generation creation if the API already supports them.
- Validate all payloads.
- Do not return secret provider configuration.
- Redact provider voice IDs where appropriate for non-administrator roles.
- Add OpenAPI or repository-native API contract documentation.
- Add request and response examples.
- Preserve backward compatibility where feasible.

---

# CLI integration

Provide repository-native equivalents of:

```bash
mediaforge speech profiles list
mediaforge speech profiles show <profile>
mediaforge speech profiles validate <profile-version>
mediaforge speech estimate --video <video-id>
mediaforge speech generate --video <video-id>
mediaforge speech generate --video <video-id> --profile <profile-version>
mediaforge speech generate --video <video-id> --force
mediaforge speech status <generation-id>
mediaforge speech retry <generation-id>
```

Requirements:

- Use the shared application service.
- Do not call provider adapters directly.
- Return non-zero exit codes on failures.
- Provide actionable error messages.
- Support machine-readable JSON output if the CLI already follows that pattern.
- Never print API keys or raw secrets.
- Make profile resolution visible in dry-run/estimate output.
- Show cache-hit expectation where determinable.
- Show quota impact.
- Preserve existing command aliases temporarily if necessary and mark them deprecated.

---

# Episode workflow integration

Record a speech task entry equivalent to:

```json
{
  "task": "speech-generate",
  "provider": "elevenlabs",
  "voiceProfileVersionId": "vpv_...",
  "generationId": "spg_...",
  "cacheHit": false,
  "status": "SUCCEEDED",
  "artifacts": {
    "raw": ["..."],
    "master": "..."
  }
}
```

Requirements:

- Use the existing workflow log/journal format.
- Record exact CLI or application action where repository conventions require it.
- Record next actionable step after success or failure.
- On retryable failure, mark the task retryable.
- On quota/configuration/consent block, mark the task blocked with an operator action.
- Never mark a fallback provider generation as equivalent to the failed requested voice.
- Ensure resume behavior is idempotent.
- Preserve prior episode workflow history.

---

# Frontend integration

Add production-quality administration and generation UI using existing design-system components.

## Genre speech settings

Display:

- default voice profile;
- provider badge;
- active profile version;
- supported language validation;
- consent status;
- monthly quota;
- current usage;
- preview generation action;
- profile-version history;
- explicit warning before changing the active genre default.

## Video settings

Display:

- "Use genre default";
- explicit profile override;
- resolved effective profile;
- provider;
- estimated characters;
- estimated cost;
- quota impact;
- cache-hit indication where available;
- generation state;
- failure reason;
- explicit retry;
- explicit replacement-profile action;
- artifact status.

Rules:

- Frontend uses API/application contracts.
- Frontend never calls provider APIs directly.
- Frontend never receives provider API keys.
- Use accessible form controls.
- Add loading, empty, error, and disabled states.
- Use existing i18n infrastructure.
- Avoid embedding provider-specific logic outside profile configuration views.
- Add tests for profile resolution display and blocked generation states.

---

# Observability

## Structured logs

Include:

```text
generationId
videoId
genreId
provider
profileVersionId
textHash
characterCount
providerRequestId
durationMs
cacheHit
estimatedCredits
actualCredits
errorCode
stateTransition
```

Do not log:

- full narration text;
- API keys;
- consent evidence;
- raw provider responses containing sensitive data;
- full profile configuration when it contains provider identifiers not intended for operators.

## Metrics

Add repository-conventional equivalents of:

```text
speech_generation_total
speech_generation_duration_seconds
speech_generation_failures_total
speech_generation_characters_total
speech_generation_credits_total
speech_cache_hits_total
speech_queue_depth
speech_quota_remaining
speech_chunk_generation_total
speech_provider_rate_limit_total
```

Use bounded-cardinality labels.

Recommended labels:

```text
provider
genre
status
error_class
cache_hit
```

Do not label by video ID, generation ID, text hash, voice ID, or provider request ID.

## Tracing

Create spans for:

- profile resolution;
- consent validation;
- cost estimation;
- quota reservation;
- cache lookup;
- cache claim;
- each provider chunk;
- audio concatenation;
- audio mastering;
- artifact persistence;
- usage reconciliation.

Do not attach narration text to spans.

---

# Security requirements

- Store ElevenLabs credentials only through the existing secret-management path.
- Validate outbound provider base URLs.
- Prevent arbitrary URL injection.
- Apply request timeouts.
- Apply response-size limits where possible.
- Stream provider audio instead of unbounded buffering.
- Validate content type.
- Validate generated artifact duration and file integrity.
- Execute FFmpeg safely without shell interpolation.
- Use secure temporary files and cleanup.
- Enforce authorization for profile and genre policy mutation.
- Audit every activation, deprecation, override, retry, and replacement.
- Ensure tenant isolation where applicable.
- Avoid server-side request forgery.
- Avoid logging sensitive configuration.
- Add dependency and license review for any new SDK.
- Pin dependency versions consistently with repository policy.

---

# Error model

Create structured domain errors with stable codes, equivalent to:

```text
SPEECH_PROFILE_NOT_FOUND
SPEECH_PROFILE_VERSION_INACTIVE
SPEECH_PROFILE_INVALID
SPEECH_CONSENT_MISSING
SPEECH_CONSENT_EXPIRED
SPEECH_CONSENT_REVOKED
SPEECH_PROVIDER_DISABLED
SPEECH_PROVIDER_AUTHENTICATION_FAILED
SPEECH_PROVIDER_RATE_LIMITED
SPEECH_PROVIDER_TIMEOUT
SPEECH_PROVIDER_UNAVAILABLE
SPEECH_PROVIDER_REJECTED_INPUT
SPEECH_PROVIDER_INVALID_RESPONSE
SPEECH_QUOTA_EXCEEDED
SPEECH_CACHE_CLAIM_CONFLICT
SPEECH_AUDIO_PROCESSING_FAILED
SPEECH_ARTIFACT_PERSISTENCE_FAILED
SPEECH_GENERATION_NOT_RETRYABLE
SPEECH_GENERATION_CANCELLED
```

Map external errors once, at the adapter boundary.

Expose operator-safe messages while retaining diagnostic causes internally.

---

# Database and migration requirements

Create safe, reversible migrations.

Requirements:

- Backfill existing OpenAI configuration into a default OpenAI voice profile/version.
- Preserve existing generated audio metadata.
- Link historical generations where possible.
- Do not delete legacy data during initial migration.
- Add constraints only after backfill.
- Document rollback behavior.
- Add indexes for active generations, cache keys, profile resolution, usage periods, and workflow queries.
- Consider table growth and retention.
- Avoid large table locks where repository scale makes them unsafe.
- Add migration tests if supported.

If the repository is not database-backed for this subsystem, introduce storage through the existing persistence abstraction rather than ad hoc JSON files, unless repository architecture explicitly requires file-backed state.

---

# Testing requirements

Implement comprehensive tests.

## Unit tests

Cover:

- profile precedence;
- profile version validation;
- consent validation;
- cache-key stability;
- cache-key sensitivity to every relevant input;
- Unicode NFC normalization;
- chunk splitting;
- no text loss or duplication;
- quota calculations;
- state transitions;
- retry classification;
- provider error mapping;
- pricing-version calculations;
- redaction behavior.

## Provider adapter tests

Use mocked HTTP or provider clients.

Cover:

- successful streaming response;
- authentication failure;
- timeout;
- cancellation;
- rate limit;
- 5xx;
- malformed response;
- unexpected content type;
- missing request ID;
- usage metadata extraction;
- chunk context mapping.

Do not call paid provider APIs in default CI.

## Integration tests

Cover:

- existing OpenAI generation through the new interface;
- ElevenLabs generation through a fake provider;
- genre default resolution;
- video override;
- system fallback to OpenAI only when no explicit genre/video profile exists;
- no fallback after ElevenLabs failure;
- cache hit;
- forced regeneration;
- concurrent identical generation requests;
- quota reservation race;
- consent expiration;
- workflow resume;
- artifact persistence;
- API authorization;
- CLI exit codes.

## Audio processing tests

Use small deterministic fixtures.

Verify:

- concatenation order;
- 48 kHz output;
- mono output;
- FLAC output;
- loudness target within reasonable tolerance;
- true-peak safety;
- cleanup after failure;
- invalid audio rejection.

## Frontend tests

Cover:

- genre default selection;
- video override;
- resolved profile display;
- cost estimate;
- quota warning;
- blocked consent state;
- retryable failure;
- permanent failure;
- feature-disabled state;
- accessibility of controls.

## Regression tests

Before replacing the OpenAI path, capture current behavior and assert:

- same effective voice/model defaults;
- same text input;
- same artifact naming or documented migration;
- same workflow semantics;
- no duplicate provider invocation.

---

# Documentation

Create or update:

1. Architecture document for speech generation.
2. ADR for provider-neutral speech architecture.
3. ADR for immutable voice profiles.
4. ADR for no silent provider fallback.
5. ElevenLabs setup guide.
6. Secret configuration guide.
7. Voice consent operational guide.
8. Cost/quota configuration guide.
9. CLI usage documentation.
10. API/OpenAPI documentation.
11. Workflow recovery runbook.
12. Provider outage runbook.
13. Quota exhaustion runbook.
14. Profile rotation/deprecation runbook.
15. Multilingual listening-test checklist.
16. Migration and rollback notes.
17. Security and privacy review.
18. Known limitations.

Include concrete examples but no real API keys.

---

# Feature flag and rollout

Add an ElevenLabs feature flag.

Recommended rollout:

1. deploy shared contracts and migrated OpenAI adapter;
2. verify OpenAI regression suite;
3. deploy persistence and profile resolution;
4. deploy cache and quota controls;
5. deploy ElevenLabs adapter disabled;
6. validate in development with a test voice;
7. enable in staging;
8. run multilingual listening tests;
9. enable for one pilot genre;
10. monitor cost, failures, latency, cache rate, and audio quality;
11. enable per-video overrides;
12. expand to additional genres only after explicit approval.

Do not automatically make the cloned voice a production default.

---

# Listening-test workflow

Create a repeatable evaluation process.

Use a fixed script per supported language containing:

- normal narration;
- names;
- numbers;
- dates;
- abbreviations;
- emotional emphasis;
- questions;
- long sentences;
- short sentences;
- foreign terms;
- likely pronunciation edge cases.

Record:

```text
profileVersionId
language
reviewer
date
intelligibility
voiceSimilarity
pronunciation
pacing
stability
audioArtifacts
decision
notes
```

Require approval before a new profile version becomes the genre default.

---

# Required acceptance criteria

The work is complete only when all of the following are true:

- Existing OpenAI speech generation works through the common provider interface.
- There is no independent duplicate OpenAI speech-generation path.
- ElevenLabs can be enabled through configuration and a feature flag.
- A genre can select an ElevenLabs profile version as its default.
- A video can explicitly override its genre profile.
- The system default remains OpenAI when no genre or video profile is configured.
- Profile versions are immutable.
- Every generation pins the exact profile version.
- Consent is validated before cloned-voice generation.
- Identical generation requests reuse cached audio.
- Concurrent identical requests produce at most one provider invocation.
- Forced regeneration creates a new lineage without overwriting history.
- Quotas are checked and reserved before provider invocation.
- Estimated and actual usage are recorded.
- Cache hits record zero new provider cost.
- Failed ElevenLabs jobs never silently switch provider or voice.
- Retryability is classified explicitly.
- Raw provider artifacts are retained.
- A canonical 48 kHz mono FLAC master is produced.
- API, CLI, workflow, and frontend use the same application service.
- Provider credentials never reach the frontend or logs.
- Narration text is not written to structured logs or traces.
- Metrics use bounded-cardinality labels.
- OpenAI regression tests pass.
- ElevenLabs adapter tests pass without paid API access.
- Concurrency and quota-race tests pass.
- Frontend states are tested.
- Documentation and runbooks are complete.
- One pilot multilingual cloned-voice profile can be configured without hard-coding the genre or person.

---

# Explicit non-goals

Do not implement:

- subtitle generation;
- word-level timestamps;
- forced alignment;
- automatic provider fallback;
- automatic cloned-voice activation in production;
- voice cloning/training inside this repository;
- browser-side provider calls;
- arbitrary user-supplied provider base URLs;
- direct provider SDK usage outside adapters;
- destructive migration of existing OpenAI audio data;
- a second speech pipeline.

---

# Final verification

After implementation:

1. run formatting;
2. run linting;
3. run type checking;
4. run unit tests;
5. run integration tests;
6. run frontend tests;
7. run migration validation;
8. run security review;
9. run dependency review;
10. run OpenAI regression tests;
11. run concurrency and quota-race tests;
12. verify no API keys or narration text appear in logs;
13. verify no direct provider calls exist outside adapters;
14. verify API, CLI, workflow, and frontend resolve profiles identically;
15. verify documentation matches the implementation.

Search the repository for:

```text
openai speech
text-to-speech
tts
speech generation
elevenlabs
voiceId
api key
ffmpeg
audio artifact
```

Confirm that no legacy or duplicate provider invocation remains.

---

# Required final Codex report

At completion, provide:

## 1. Architecture summary

Describe the final request flow and module boundaries.

## 2. Files changed

Group by:

- domain;
- application;
- infrastructure;
- database;
- API;
- CLI;
- workflows;
- frontend;
- tests;
- documentation.

## 3. Migration summary

Explain backfill, constraints, rollback, and compatibility.

## 4. Security summary

Explain secret handling, authorization, consent enforcement, redaction, and outbound request controls.

## 5. Test results

Include exact commands, exit codes, and failures or skipped tests.

## 6. Operational setup

List required environment variables, feature flags, migrations, seed commands, and rollout steps.

## 7. Remaining risks

List unresolved issues, assumptions, provider limitations, and operator decisions.

## 8. Acceptance-criteria matrix

For every acceptance criterion, report:

```text
PASS
PARTIAL
FAIL
NOT APPLICABLE
```

Include evidence paths or test names.

Do not claim completion when any critical acceptance criterion is unverified.
