# VJ-11 — Recover from Provider or Runtime Failure

## Primary actor
Production Operator

## Main flow
1. A provider call, rendering task, storage operation, or processing stage fails.
2. System classifies the failure as retryable, configuration, quota/rate-limit, invalid input, policy, or permanent provider failure.
3. Retryable operations use bounded retries/backoff and idempotency keys.
4. Fallback providers are used only when configured and semantically compatible.
5. Failed stages do not invalidate successful unrelated outputs.
6. Operator sees a concise diagnostic and recovery action.
7. Resuming the job starts from the first stale/failed dependency rather than restarting the whole episode.
8. Audit log captures attempts and provider usage.

## Success outcome
Failures are isolated and recoverable without duplicating work or spending.
