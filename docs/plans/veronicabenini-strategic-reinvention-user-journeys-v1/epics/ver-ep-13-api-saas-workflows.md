# VER-EP-13 — API/SaaS workflows

## VER-120 — Create episode via API

**Priority:** P0  
**Actor:** API Consumer  
**Journeys:** VJ-12

As an API consumer, I want to create an episode through a typed versioned contract so that workflows can be automated.

### Acceptance criteria
- Contract validates input.
- Tenant context is mandatory.
- Response returns canonical resource/revision IDs.

## VER-121 — Start production via API

**Priority:** P0  
**Actor:** API Consumer  
**Journeys:** VJ-12

As an API consumer, I want to start production idempotently so that orchestration is reliable.

### Acceptance criteria
- Requires authorized episode revision.
- Supports idempotency key.
- Returns run/status resource.

## VER-122 — Observe run status via API

**Priority:** P0  
**Actor:** API Consumer  
**Journeys:** VJ-12,VJ-11

As an API consumer, I want stage-level status and failure details so that external systems can react.

### Acceptance criteria
- Status model is stable and typed.
- Failure reason is actionable without leaking secrets.
- Resource version/change timestamp is exposed.

## VER-123 — Approve or reject via API

**Priority:** P1  
**Actor:** API Consumer  
**Journeys:** VJ-12,VJ-07

As an authorized reviewer integration, I want to approve/reject exact revisions so that governance is available without UI-only workflows.

### Acceptance criteria
- Authorization distinguishes reviewer capability.
- Target revision hash/ID is mandatory.
- Audit event is created.

## VER-124 — Receive production events

**Priority:** P1  
**Actor:** API Consumer  
**Journeys:** VJ-12

As an API consumer, I want webhook/event notifications for meaningful lifecycle changes so that polling can be minimized.

### Acceptance criteria
- Events have stable type/schema/version.
- Delivery is retryable and deduplicable.
- Consumer can reconcile event with authoritative resource state.

## VER-125 — Enforce tenant isolation

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-12

As an administrator, I want strict tenant isolation across sources, artifacts, credentials, logs, and jobs so that SaaS data cannot cross boundaries.

### Acceptance criteria
- Every tenant-bound resource is authorized server-side.
- Storage paths/queries cannot cross tenant boundaries.
- Cross-tenant access tests cover critical APIs.
