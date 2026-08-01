# Codex Prompt — Complete and Productionize Provider-Neutral Speech Generation

## Role

Act as the principal TypeScript platform engineer completing an in-progress,
production-critical speech-generation migration.

Do not rebuild the subsystem from scratch. Preserve, audit, repair, integrate, and prove
the implementation already present in the worktree.

## Working-tree warning

The provider-neutral speech implementation is currently uncommitted on top of base commit
`a30e981`. Treat every existing tracked modification and untracked speech file as valuable
work. Do not reset, restore, overwrite, or discard it. Untracked files under
`channels/mathe/` are unrelated user assets and must not be modified.

Before acting, read the repository `AGENTS.md` instructions and then read:

- `docs/ai-context/context-pack.md`
- `docs/plans/provider-neutral-speech-generation-plan.md`
- `docs/reports/2026-08-01/provider-neutral-speech-generation-plan-implementation-report.md`
- `docs/reports/codex-runs/2026-08-01-provider-neutral-speech-generation.md`
- `docs/development/speech-known-limitations.md`
- `docs/architecture/provider-neutral-speech-generation.md`
- `docs/architecture/speech-generation-current-state.md`

Inspect source and tests before trusting those documents. Source code is authoritative.

## Objective

Finish every incomplete production integration and verification item for the
provider-neutral speech subsystem. Do not claim completion while any critical acceptance
criterion is partial, failed, or unverified.

The finished system must have exactly one speech-generation application path used by API,
CLI, automated episode workflows, math/dark-truth/educational workflows, benchmarking,
and frontend-triggered actions. Provider adapters must not be invoked outside the shared
application service.

## Current foundation to preserve

The worktree already contains:

- provider-neutral domain contracts and stable errors under
  `packages/speech/src/platform/`;
- `SpeechGenerationService`, profile resolution, consent validation, canonical cache keys,
  semantic chunking, quota/pricing conformance components, state transitions, and workflow
  adapter;
- OpenAI compatibility transport and provider adapter;
- typed streaming ElevenLabs HTTP adapter with feature flag, URL validation, timeout,
  cancellation, size/content checks, and error mapping;
- raw artifact and canonical 48 kHz mono FLAC mastering components;
- additive PostgreSQL schema/repository foundation;
- API contracts/routes, connected CLI commands, web administration rendering, examples,
  ADRs, runbooks, and focused unit tests.

Extend these modules. Do not introduce another provider registry, cache, quota mechanism,
profile model, HTTP client path, or generation service.

## Mandatory completion sequence

### 1. Stabilize and checkpoint the existing patch

1. Inspect `git status`, `git diff --check`, and focused diffs.
2. Separate semantic speech changes from incidental formatting expansion in touched legacy
   files. Reduce formatting-only churn safely without losing implementation work.
3. Run the narrow existing speech tests and affected-package typechecks permitted by
   `AGENTS.md`.
4. Repair type or test failures before adding more behavior.
5. Create a focused checkpoint commit containing only speech work; never add the unrelated
   `channels/mathe/` assets.

### 2. Compose durable production use cases

Implement repository-native adapters that connect `SpeechGenerationService` and profile
administration to PostgreSQL, artifact storage, configuration/secrets, workflow journals,
logging, metrics, and tracing.

Production API startup must inject a real `SpeechApiUseCases` implementation. Remove the
default 503 for correctly configured deployments while retaining a clear configuration
failure when dependencies are absent.

Implement and test:

- profile CRUD, immutable version creation, validation, activation, deprecation, and safe
  response redaction;
- video → genre → system OpenAI resolution;
- generation creation/status/retry/cancel/replacement;
- API idempotency replay and conflict detection;
- optimistic concurrency for mutable policies;
- fenced cache claim, cache hit, wait/subscription, lease renewal, expired-owner recovery,
  and authoritative completion;
- durable chunk outcomes and safe retry of only failed chunks;
- atomic provider/genre quota reservations and actual-usage reconciliation;
- cache-hit ledger records with zero new provider usage;
- audit records for activation, deprecation, override, retry, cancellation, and replacement;
- tenant scoping and authorization at every adapter boundary.

Use transactions and existing persistence abstractions. Do not add ad hoc JSON state.

### 3. Eliminate legacy provider execution paths

Audit and migrate all direct uses of the legacy file-oriented provider, including the
currently known locations:

- `apps/cli/src/index.ts`
- `apps/cli/src/math-commands.ts`
- `packages/dark-truth/src/index.ts`
- `packages/speech/src/voice-benchmark.ts`
- `packages/speech/src/educational-speech-pipeline.ts`
- `packages/speech/src/index.ts`

All generation calls must converge on `SpeechGenerationService`. Preserve documented
legacy command aliases only as wrappers around that service, emit deprecation guidance,
and establish a concrete removal point. There must be no independent call to
`client.audio.speech.create`, `/v1/audio/speech`, ElevenLabs TTS endpoints, or a provider
adapter outside the adapter/compatibility boundary.

Capture OpenAI regression behavior before changing each caller: model, voice, text,
output/artifact path, workflow semantics, and invocation count.

### 4. Complete provider and audio hardening

Expand mocked adapter tests to cover ElevenLabs authentication failure, timeout,
cancellation, rate limiting, 5xx, malformed body, invalid content type, response-size
limit, missing request ID, usage extraction, pronunciation dictionaries, and chunk
context. Confirm retry classification for every stable domain error.

Add deterministic small audio fixtures and exercise the real repository FFmpeg process
abstraction. Verify concatenation order, valid FLAC, 48 kHz, mono, signed 16-bit PCM,
two-pass loudness near -16 LUFS, true peak at or below -1.5 dBTP, invalid-audio rejection,
bounded diagnostics, and temporary-file cleanup. Do not alter final-video mixing outside
the renderer boundary.

### 5. Complete entry-point integrations

- API: exercise every speech route through real use cases, authentication, authorization,
  idempotency, ETags, safe errors, redaction, and OpenAPI examples.
- CLI: support all required profile, estimate, generate, force, status, retry, JSON, dry-run,
  cache, quota, and actionable failure behavior through the shared service/API boundary.
- Workflows: integrate speech generation into actual episode resume/journal execution,
  preserving history, exact profile version, artifacts, next action, blocked states, and
  idempotent recovery.
- Frontend: connect the repository's real frontend surface to API contracts. Cover genre
  defaults, overrides, resolved profile, consent, quota, estimates, cache expectation,
  generation states, retry/replacement, history, loading/empty/error/disabled states, i18n,
  authorization, and accessibility. Never call providers from the browser.

If repository architecture genuinely has no interactive frontend runtime, document the
evidence and implement the strongest repository-native contract/view integration rather
than adding a new framework.

### 6. Complete observability and operational controls

Bind the instrumentation port to existing telemetry. Add all requested metrics, including
queue depth and quota remaining, with bounded labels only. Trace profile resolution,
consent, cost, quota, cache, every provider chunk, concatenation, mastering, persistence,
and reconciliation. Structured logs must contain hashes/counts and identifiers but never
full narration, credentials, evidence, raw responses, or unrestricted provider config.

Validate feature-disabled startup behavior, secret-provider integration, outbound host
allowlisting, artifact integrity/duration checks, retention considerations, and dependency
licenses. Do not call a paid provider in default tests.

### 7. Prove persistence concurrency and migrations

Add PostgreSQL-backed integration tests demonstrating:

- concurrent identical requests make at most one provider call;
- waiters reuse the authoritative master;
- an expired owner is reclaimed without deadlock;
- stale fencing tokens cannot publish artifacts;
- forced generations preserve cache authority and lineage;
- parallel quota reservations cannot cross provider or genre hard limits;
- actual usage above estimate reconciles safely;
- idempotency replay returns the original generation and mismatched payloads conflict;
- profile version immutability and in-use deletion protection;
- tenant isolation;
- migration and OpenAI backfill are repeatable and preserve legacy data;
- rollback disables dispatch without deleting audit records or artifacts.

Classify fixture failures according to `AGENTS.md`; do not weaken assertions or regenerate
broad fixtures.

### 8. Final audit and documentation reconciliation

Update architecture, ADRs, setup, consent, quota/cost, API/CLI, migration, security,
listening-test, and recovery/outage/quota/profile-rotation documentation to match the final
code. Remove resolved limitations and retain genuine ones.

Because this prompt is under `docs/plans/`, create/update:

`docs/reports/<YYYY-MM-DD>/provider-neutral-speech-generation-completion-prompt-implementation-report.md`

Also create the normal Codex run report required by `AGENTS.md`.

## Required verification

Respect the repository's cost- and time-bounded verification rules. Use safe batches and
focused commands; checkpoint independently verifiable batches. Across batches, verify:

1. formatting and affected lint;
2. affected-package typechecks;
3. speech unit and provider-adapter tests;
4. API, CLI, workflow, and frontend tests;
5. OpenAI regression tests;
6. PostgreSQL migration, cache-concurrency, and quota-race tests;
7. real-FFmpeg audio processing tests;
8. security and secret/log redaction checks;
9. direct-provider-call audit;
10. documentation consistency.

Run repository searches excluding generated trees for:

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
client.audio.speech.create
/v1/audio/speech
```

Manually inspect every remaining match that could invoke a provider. A compatibility
wrapper is acceptable only if it delegates to the shared application service.

## Non-negotiable acceptance gates

Do not report completion unless all are proven:

- production API, CLI, episode workflows, math/dark-truth/educational workflows,
  benchmarking, and frontend-triggered actions resolve profiles through the same service;
- no independent OpenAI or ElevenLabs invocation remains;
- OpenAI regression tests pass;
- ElevenLabs adapter tests pass without paid calls;
- production composition starts with ElevenLabs disabled and fails safely if enabled
  without credentials;
- genre defaults, video overrides, and the OpenAI system default work durably;
- active profile versions are immutable and every generation pins one exact version;
- cloned-voice activation and generation enforce current channel/language consent;
- cache reuse, force lineage, lease recovery, and fencing are PostgreSQL-proven;
- quota reservations and reconciliation are race-safe;
- provider failures never switch provider or voice;
- raw artifacts and canonical FLAC masters are persisted and audio-validated;
- generation state, retry, cancellation, chunks, usage, and audit records are durable;
- secrets and narration never appear in frontend payloads, logs, traces, or reports;
- requested metrics use bounded-cardinality labels;
- migrations/backfill/rollback and tenant isolation are tested;
- documentation matches the deployed behavior;
- the pilot cloned-voice profile remains generic, draft by default, and requires explicit
  listening-test and operator approval.

## Final response format

Lead with `COMPLETE` only if every critical gate passes. Otherwise lead with `INCOMPLETE`
and name the exact blockers.

Report:

1. architecture and production composition;
2. files changed, grouped by layer;
3. migration/backfill/rollback;
4. security and privacy controls;
5. exact verification commands, exit codes, failures, and skipped checks;
6. environment variables, migrations, seeds, and rollout steps;
7. remaining risks and operator decisions;
8. every acceptance gate as PASS/PARTIAL/FAIL with evidence paths or test names;
9. commit hashes for each checkpoint.

Do not activate a real cloned voice, enable a production genre default, call a paid API,
print secrets, modify generated assets, or include unrelated work in commits.
