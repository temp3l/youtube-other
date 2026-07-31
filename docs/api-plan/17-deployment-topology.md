# Deployment Topology

## Recommended first topology

- **Recommended:** a modular monolith codebase deployed as separately selectable process roles: stateless API, scheduler/outbox dispatcher, general/provider worker, render worker, and webhook dispatcher.
- **Recommended:** PostgreSQL is authoritative for tenants, resources, workflow/job state, idempotency, leases, outbox, usage, and audit. S3-compatible object storage is authoritative for new large assets.
- **Recommended:** use a PostgreSQL-backed job table first (`FOR UPDATE SKIP LOCKED`, leases, heartbeats) to minimize infrastructure. Adopt a queue broker only when measured throughput or isolation requires it.
- **Verified:** remote/container render evidence already exists (`docker/math-render-worker/Dockerfile`, `packages/math-rendering/src/worker/math-render-worker.ts`, and remote-rendering paths in `packages/rendering/src/index.ts`).
- **Verified:** current SQLite and local JSON stores are single-host/local-workspace oriented (`packages/persistence/src/index.ts`, `packages/workflow-engine/src/workflow-store.ts`).

## Process responsibilities

| Role               | Network/credential scope                       | Responsibility                                        |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| API                | OIDC/JWKS, DB, object-store signing            | validate/authenticate, call use cases, enqueue, query |
| Scheduler/outbox   | DB, queue                                      | schedules, outbox relay, stuck-run detection          |
| General worker     | DB, object storage, selected AI/TTS            | short provider/deterministic steps                    |
| Render worker      | object storage, no tenant admin                | isolated CPU/GPU/FFmpeg rendering                     |
| Publish worker     | DB, object storage read, secret store, YouTube | serialized irreversible mutations                     |
| Webhook dispatcher | DB, constrained outbound HTTPS                 | signed deliveries                                     |

The API never runs FFmpeg or long provider calls in request handlers.

## Transitional single-host mode

Run all roles on one host with PostgreSQL, an S3-compatible local service or filesystem storage adapter, and separate process identities. Existing workspaces use a filesystem bridge that translates asset IDs to validated contained paths. This mode preserves CLI operation while exercising the target ports.

## Scaling and availability

Scale stateless API and general workers horizontally. Scale render workers by weighted capacity. Publish workers partition/lock by channel. Multi-AZ database/object storage and rolling worker deployment are pilot hardening; disaster recovery targets, region, and data residency are operator decisions.

See `diagrams/deployment-topology.mmd`.
