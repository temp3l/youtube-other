# VER-EP-12 — Publishing and metadata

## VER-110 — Generate publishing metadata

**Priority:** P1  
**Actor:** Creator  
**Journeys:** VJ-10

As a creator, I want titles, descriptions, tags, chapters, and related metadata generated from the approved episode so that publishing is efficient.

### Acceptance criteria
- Metadata is tied to exact locale/revision.
- User can edit before publishing.
- Metadata changes do not regenerate visual assets.

## VER-111 — Preflight publishing

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-10

As an operator, I want publishing requirements validated before upload so that incomplete/unauthorized releases fail closed.

### Acceptance criteria
- Approval status is validated.
- Credentials and required platform metadata are validated.
- Visibility/schedule defaults are explicit.

## VER-112 — Publish an approved edition

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-10

As a creator, I want to publish an exact approved edition so that released content matches review.

### Acceptance criteria
- Published platform ID is stored.
- Exact production revision is recorded.
- Idempotent retry avoids duplicate platform upload where supported.

## VER-113 — Schedule publication

**Priority:** P1  
**Actor:** Creator  
**Journeys:** VJ-10

As a creator, I want to schedule an approved edition so that release timing can be planned.

### Acceptance criteria
- Schedule uses target platform/timezone semantics explicitly.
- Scheduled revision cannot silently change after scheduling.
- Cancellation/update is auditable.
