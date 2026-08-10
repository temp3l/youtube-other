# VER-EP-09 — Regeneration, caching, and idempotency

## VER-080 — Compute typed invalidation

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-08

As the system, I want dependency-aware invalidation so that only affected artifacts are regenerated.

### Acceptance criteria
- Dependencies are explicit and typed.
- Invalidation reason is inspectable.
- No unrelated artifact is invalidated by default.

## VER-081 — Cache expensive provider outputs

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-08,VJ-09

As the system, I want compatible LLM/image/TTS results cached so that retries and regeneration do not repeat cost-bearing work.

### Acceptance criteria
- Cache key includes semantic inputs and relevant config/model versions.
- Reuse is auditable.
- User can force regeneration with explicit intent/authorization.

## VER-082 — Make mutations idempotent

**Priority:** P0  
**Actor:** API Consumer  
**Journeys:** VJ-08,VJ-12

As an API consumer, I want retriable mutations to be idempotent so that network retries do not duplicate jobs or artifacts.

### Acceptance criteria
- Idempotency key semantics are documented.
- Same key/same request returns same logical result.
- Conflicting payload under same key returns explicit conflict.

## VER-083 — Resume from first stale stage

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-08,VJ-11

As an operator, I want a failed or changed run to resume from the earliest affected dependency so that prior valid work is preserved.

### Acceptance criteria
- Resume plan is visible.
- Successful compatible stages are reused.
- Run lineage records parent/attempt.

## VER-084 — Explain reuse vs regeneration

**Priority:** P1  
**Actor:** Reviewer  
**Journeys:** VJ-07,VJ-08

As a reviewer, I want to know why each artifact was reused or regenerated so that I can trust caching behavior.

### Acceptance criteria
- Reason codes are machine-readable.
- Review pack can surface reason summaries.
- Provider-cost-bearing rebuilds include triggering dependency.
