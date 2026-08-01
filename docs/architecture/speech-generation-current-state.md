# Speech generation current state

Date: 2026-08-01

## Implemented production path

- API startup injects PostgreSQL-backed `SpeechApiUseCases` and filesystem artifacts.
- API and connected CLI support profile create/version/validate/activate/deprecate,
  policies, overrides, estimate, generate, status, retry, and cancellation.
- Profile resolution is video override → genre policy → idempotent OpenAI system default.
- Cache ownership, fencing, lease recovery, quota reservations, reconciliation, chunk
  attempts, usage, and audits are durable and workspace scoped.
- OpenAI and ElevenLabs adapters are invoked by `SpeechGenerationService`. Legacy file
  callers receive a service-backed compatibility facade with no model fallback.
- Raw responses and canonical 48 kHz mono signed-16 FLAC masters are persisted and probed.

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

## Remaining gaps

- Canonical narration text/language is not persisted for lookup by video ID; callers must
  send both fields and retries must resend the exact narration.
- Episode resume/journal execution and frontend actions are not direct speech API clients;
  legacy workflows still cross the deprecated file facade.
- `apps/web` remains a server-rendered accessible state model without forms or i18n.
- Consent/listening approval persistence exists, but dedicated consent CRUD and listening
  approval HTTP operations are not exposed.
- Deployment-specific metrics exporters and distributed tracing remain external.
- The compatibility facade remains until 2026-10-01 and constructs the old OpenAI client
  only inside the designated transport boundary.

## Migration constraints

Legacy files and metadata remain stable. PostgreSQL additions are additive and
tenant-scoped. ElevenLabs defaults disabled, and no cloned profile or genre default is
activated automatically.
