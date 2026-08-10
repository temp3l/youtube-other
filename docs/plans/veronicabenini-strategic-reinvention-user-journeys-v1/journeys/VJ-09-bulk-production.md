# VJ-09 — Bulk-Produce Multiple Episodes

## Primary actor
Production Operator

## Main flow
1. Operator selects a set of episode definitions or source packs.
2. System preflights configuration, credentials, quotas, source availability, and estimated paid-provider usage.
3. Valid episodes enter the queue; invalid episodes are isolated with actionable blockers.
4. Independent stages run in parallel within configured concurrency and provider limits.
5. Shared cache/deduplication prevents duplicate work.
6. Operator sees per-episode and aggregate status.
7. Failures can be retried per episode/stage.
8. Bulk approval pack can aggregate selected episodes without hiding per-episode defects.
9. Successful episodes are not rolled back because another episode fails.

## Success outcome
Large batches complete with bounded concurrency, cost controls, isolation, and resumability.
