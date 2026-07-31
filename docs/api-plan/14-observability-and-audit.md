# Observability and Audit

## Current evidence

- **Verified:** Pino structured logging and contextual fields exist in `packages/observability/src/index.ts`.
- **Verified:** `ExecutionTelemetry` records provider/process attempts, request IDs, durations, retries, token/duration/image usage, estimated costs, and JSON reports (`packages/observability/src/telemetry.ts`).
- **Verified:** math has separate correlation/event helpers (`packages/observability/src/math-telemetry.ts`).
- **Inferred:** file reports and process-local `AsyncLocalStorage` are useful characterization evidence but cannot provide multi-worker querying, immutable audit, or durable billing.

## Identifier propagation

| ID                       | Created by                       | Propagation                      |
| ------------------------ | -------------------------------- | -------------------------------- |
| `request_id`             | HTTP edge                        | response header and request logs |
| `correlation_id`         | first external request or caller | all descendant jobs/events       |
| `causation_id`           | immediate command/event          | outbox and audit chain           |
| `workflow_run_id`        | application use case             | jobs, steps, assets, logs        |
| `job_id`                 | durable dispatcher               | queue message and worker spans   |
| `step_id` / `attempt_id` | workflow/worker                  | provider calls and checkpoints   |

CLI creates a correlation ID and calls the same use case, so CLI/API traces remain comparable.

## Three separate records

1. Operational logs: searchable, sampled, redacted, retention-bounded diagnostics.
2. Metrics/traces: aggregatable performance and reliability signals; OpenTelemetry-compatible propagation.
3. Audit events: append-only, unsampled facts about identity, authorization-sensitive changes, approvals, credentials, and publishing. Audit payloads store IDs, hashes, decision, actor, source, and result—not secret values.

Audit events need a monotonic workspace sequence and tamper evidence (hash chain or WORM export). Corrections append a new event.

## Required telemetry

- HTTP latency/error/cardinality by route template, version, principal type.
- Queue depth/age, claim latency, lease expiry, retries, dead letters, cancellations.
- Workflow/step state duration, cache hit/miss/reason, approval wait, stuck runs.
- Provider latency/status/retry, rate-limit signals, token/image/audio usage and estimated/actual cost.
- Render queue time, CPU/memory/disk, media duration, real-time factor, cancellation latency.
- Asset upload/download/scan failures and storage bytes.
- Publication attempts, reconciliation-required count, success/failure and playlist partial failures.
- Webhook success, terminal failure, age, and endpoint disablement.

Alerts: oldest runnable job, expired live lease, workflow without progress beyond class-specific SLO, publication in `provider_unknown`, outbox backlog, webhook failure rate, tenant quota saturation, credential decryption errors, and cross-tenant authorization denials.

## Privacy and cardinality

Never use workspace, episode, asset, job, or user IDs as metric labels. They may appear in access-controlled logs/traces. Prompt bodies, story/lesson text, local paths, signed URLs, OAuth material, and provider response bodies are excluded by schema. Usage records store dimensions needed for metering plus hashes/references.
