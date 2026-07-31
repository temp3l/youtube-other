# Rate Limits, Quotas, and Metering

## Policy

- **Verified:** batch contracts already model concurrency, retry limits, optional requests/second, token usage, and estimated/actual micro-costs (`packages/domain/src/workflow-contracts.ts:batchManifestSchema`).
- **Verified:** pricing and cost estimates exist in `packages/observability/src/pricing.ts` and `telemetry.ts`.
- **Recommended:** implement metering before billing. Estimates are not financially authoritative and current telemetry is file-based.

## Enforcement layers

| Layer           | Limit                                                    | Response                                                      |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Edge            | requests/minute by principal/workspace; body size        | `429` or `413`                                                |
| Application     | active workflows, batch items, approvals/publications    | `409`/`429` with stable code                                  |
| Queue admission | runnable jobs and weighted cost                          | accepted-but-paused only if contract says so; otherwise `429` |
| Worker          | render/provider concurrency, CPU, memory, disk, duration | bounded execution and retry/dead-letter                       |
| Provider        | token/image/audio/request budget                         | budget reservation before dispatch                            |
| Storage         | bytes, object count, retention                           | reject new writes or require cleanup                          |

Use hierarchical token buckets for request rates and database-backed reservations for expensive work. Return `Retry-After` and rate-limit headers. Idempotent replays do not consume a second command quota; actual provider retries are metered as attempts while customer billability remains a product rule.

## Usage ledger

Each append-only usage record contains workspace, subject type/id, workflow/job/attempt, operation code, provider/model class, quantity/unit, estimated and actual cost micros when known, timestamp, source event, and correction linkage. Aggregates are projections, not authority.

Reserve estimated budget transactionally when a costly job is admitted; settle from measured usage; release on cancellation before dispatch. Hard ceilings block dispatch. Soft ceilings alert and may require administrator override.

## Initial defaults

- API request limit: configurable per workspace and credential; no universal numeric promise in `/v1`.
- One publication mutation per publication intent.
- Separate weighted concurrency pools for provider calls, local renders, remote renders, and uploads.
- Batch maximum item count and source/upload byte limits are server-discoverable policy, not hard-coded SDK constants.

**Operator approval required:** pilot tier limits, whether queued-over-quota work pauses or fails, who bears provider retry cost, retention tiers, and any billable unit definition.
