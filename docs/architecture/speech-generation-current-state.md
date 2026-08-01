# Speech generation current state

Date: 2026-08-01

## Existing execution paths

- `packages/speech/src/index.ts` owns the file-oriented `SpeechProvider` contract and
  `OpenAiCompatibleSpeechProvider`. The adapter writes to caller-selected paths and may
  try configured fallback models.
- `packages/speech/src/narration-pipeline.ts` owns the staged narration flow and a
  per-chunk filesystem cache. It builds OpenAI-specific requests and may generate chunks
  concurrently.
- `apps/cli/src/index.ts`, `apps/cli/src/math-commands.ts`, and
  `packages/dark-truth/src/index.ts` construct the OpenAI adapter independently.
- `apps/cli/src/story-audio-command.ts` invokes the staged CLI rather than a shared
  application service.

## Reusable infrastructure

- Zod is the runtime schema convention.
- PostgreSQL repositories use tenant-scoped transactions, row-level security,
  idempotency records, `FOR UPDATE SKIP LOCKED`, fenced leases, and reclaimable jobs.
- `PostgresUsageAuditRepository` provides transactional quota reservations and an
  immutable usage/audit ledger.
- Tenant object storage provides workspace-safe artifact identities, hashes,
  quarantine/promotion, and create-if-absent behavior.
- `@mediaforge/process-runner` executes FFmpeg/FFprobe without shell interpolation and
  with bounded output and timeouts.
- Narration segmentation, assembly, validation, telemetry redaction, and a 48 kHz mono
  `-16 LUFS`/`-1.5 dBTP` mastering preset already exist.
- The API uses Node HTTP, Zod contracts, OpenAPI, OIDC/principal permissions, ETags, and
  idempotency keys.

## Gaps

- No provider-neutral generation application service or provider registry.
- No immutable voice-profile versions, consent records, genre policy, or video override.
- No durable speech generation/cache claim/chunk/usage schema.
- No ElevenLabs adapter, feature flag, or validated configuration.
- Current mastering is PCM WAV with one-pass loudness normalization, not canonical FLAC
  with measured two-pass normalization.
- No speech API, dedicated provider-neutral CLI surface, or durable speech workflow task.
- `apps/web` is a static page; no design system, forms, or i18n foundation exists.
- No metrics exporter or distributed tracing implementation exists. Speech must expose a
  bounded-cardinality instrumentation port compatible with the current telemetry layer.

## Migration constraints

The first release must preserve legacy files and metadata. Existing callers migrate to a
compatibility adapter backed by the shared application service; model/voice fallback is
not permitted after a profile has resolved. PostgreSQL additions are additive and
tenant-scoped. ElevenLabs remains disabled and no cloned profile becomes a production
default automatically.
