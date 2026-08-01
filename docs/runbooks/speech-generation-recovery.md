# Speech generation recovery runbooks

## Workflow retry and resume

Inspect generation state, failure code, chunk outcomes, and lease expiry. The current API
retry requires the exact original text/language, preserves the exact profile version, and
reuses successful raw chunks. Retry only
`RETRYABLE_FAILURE`; never edit a terminal generation. A dead owner is reclaimable after
its bounded fenced lease expires. Cancellation stops the active request and records
`CANCELLED`.

Episode workflow-journal resume is not yet directly wired to these use cases; during the
compatibility window it runs through the service-backed file facade. Do not infer API
generation state from a legacy journal entry alone.

## Provider outage

Confirm feature/config health and provider status without printing credentials. Pause new
dispatch, let rate-limit/timeout/5xx work enter bounded retry, and monitor failure, rate
limit, duration, queue-depth, and cache metrics. Do not switch providers. After recovery,
retry eligible generations. Use an explicit replacement profile only with operator
approval and preserve supersession lineage.

## Quota exhaustion

Confirm provider and genre period reservations and settled usage. Release only abandoned
reservations. Correct ledger errors with an auditable correction; do not delete usage.
Increasing a hard limit is a versioned operator decision. Cache hits remain available.

## Profile rotation and deprecation

Create a DRAFT version, validate provider configuration and consent, complete multilingual
listening approval, activate, then update one pilot policy with `If-Match`. Monitor before
expansion. Deprecate the old version only after rollback readiness; historical generations
remain pinned. Never delete an in-use version.
