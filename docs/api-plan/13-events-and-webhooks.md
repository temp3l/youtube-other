# Events and Webhooks

## Event model

- **Verified:** current workflow events are JSONL records in `packages/workflow-engine/src/workflow-store.ts`; they are local workflow evidence, not a tenant-safe integration bus.
- **Recommended:** commit domain state and an outbox row in one database transaction. A dispatcher publishes the outbox and records immutable webhook deliveries. Consumers deduplicate by `event_id`.

Event envelope:

```json
{
  "id": "evt_01...",
  "type": "workflow_run.awaiting_approval",
  "version": "1",
  "occurred_at": "2026-07-31T12:00:00Z",
  "workspace_id": "ws_01...",
  "subject": { "type": "workflow_run", "id": "wfr_01..." },
  "correlation_id": "cor_01...",
  "causation_id": "job_01...",
  "data": {}
}
```

`data` contains stable public identifiers and bounded summaries, never local paths, secrets, raw provider payloads, prompts, or presigned URLs.

## Initial event catalog

- `workflow_run.started|progressed|awaiting_approval|succeeded|partially_succeeded|failed|cancelled`
- `job.retry_scheduled|dead_lettered`
- `asset.ready|rejected|deleted`
- `validation.completed`
- `approval.created|rejected|revoked`
- `publication.started|succeeded|failed|reconciliation_required`
- `webhook_endpoint.disabled`

Events are at-least-once and may arrive out of order. Consumers order events per subject using `subject_version`; there is no global-order promise.

## Delivery contract

- POST compact JSON; 10-second timeout; no redirects.
- Headers: `Webhook-Id`, `Webhook-Timestamp`, `Webhook-Signature`, `Webhook-Attempt`.
- Signature: `v1=hex(HMAC-SHA256(secret, timestamp + "." + raw_body))`.
- Retry on network failure, `408`, `409`, `425`, `429`, and `5xx`; exponential backoff with jitter for up to 72 hours, then dead letter.
- Treat any `2xx` as accepted. Do not retry other `4xx`.
- Endpoint secrets are shown once, encrypted at rest, independently rotatable, and support an overlap window.
- Endpoint registration requires HTTPS outside an explicit local-development mode. Resolve and revalidate destinations to block private/link-local ranges.

## API operations

`POST /v1/workspaces/{workspace_id}/webhook-endpoints`, `GET/list`, `PATCH`, secret rotation, disable, and `POST .../{id}:test`. Delivery listing and replay are internal/pilot-admin features; replay creates a new delivery attempt but retains the original event ID.

Polling is the reliable MVP baseline. Webhooks are included for pilot integrations after the outbox exists. **Recommended:** defer SSE until job/event semantics and gateway timeouts are proven; SSE is an optional convenience, never the only completion signal.
