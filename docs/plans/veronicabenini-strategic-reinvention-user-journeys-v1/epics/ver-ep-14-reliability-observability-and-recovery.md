# VER-EP-14 — Reliability, observability, and recovery

## VER-130 — Classify operational failures

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-11

As an operator, I want failures categorized so that I know whether to retry, reconfigure, or edit input.

### Acceptance criteria
- Failure categories are stable/machine-readable.
- User-facing message includes next action.
- Original provider error is sanitized but traceable internally.

## VER-131 — Retry transient failures safely

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-11

As the system, I want bounded retries with backoff so that transient provider faults recover without duplicate work.

### Acceptance criteria
- Retries are bounded.
- Idempotency is preserved.
- Retry count/outcome is observable.

## VER-132 — Use configured provider fallback

**Priority:** P1  
**Actor:** Administrator  
**Journeys:** VJ-11,VJ-14

As an administrator, I want compatible fallback providers so that production can continue during outages when explicitly allowed.

### Acceptance criteria
- Fallback is opt-in/configured.
- Semantic capability compatibility is validated.
- Fallback usage is visible in lineage/cost records.

## VER-133 — Expose production metrics

**Priority:** P1  
**Actor:** Operator  
**Journeys:** VJ-09,VJ-11

As an operator, I want stage latency, failures, queue depth, retries, cache hits, and provider usage metrics so that the pipeline can be operated reliably.

### Acceptance criteria
- Metrics have bounded cardinality.
- Tenant-sensitive content is not placed in metric labels.
- Key SLO indicators can be graphed/alerted.

## VER-134 — Correlate logs across a run

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-11,VJ-12

As an operator, I want correlation IDs across episode/run/stage/provider calls so that incidents can be traced.

### Acceptance criteria
- Structured logs include stable correlation identifiers.
- Secrets/source content are redacted according to policy.
- Retries/subtasks remain linked to parent run.
