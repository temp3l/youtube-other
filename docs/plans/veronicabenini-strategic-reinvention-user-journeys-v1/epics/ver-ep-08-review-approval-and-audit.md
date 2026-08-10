# VER-EP-08 — Review, approval, and audit

## VER-070 — Generate approval pack

**Priority:** P0  
**Actor:** Reviewer  
**Journeys:** VJ-07,VJ-09

As a reviewer, I want a self-contained approval pack so that I can evaluate an episode without inspecting internal runtime state.

### Acceptance criteria
- Pack identifies exact production revision.
- Includes narration, plan, assets, lineage, diagnostics, and previews as configured.
- Pack generation itself does not alter production state.

## VER-071 — Approve a production revision

**Priority:** P0  
**Actor:** Reviewer  
**Journeys:** VJ-07,VJ-10

As a reviewer, I want to approve an exact revision so that only reviewed artifacts can progress.

### Acceptance criteria
- Approval stores actor/time/revision hashes.
- Approval is invalidated only by relevant semantic change.
- Publishing requires required approvals.

## VER-072 — Reject a specific artifact

**Priority:** P0  
**Actor:** Reviewer  
**Journeys:** VJ-07,VJ-08

As a reviewer, I want to reject a scene, translation, audio track, or other bounded artifact so that remediation can stay narrow.

### Acceptance criteria
- Rejection targets typed artifact/stage.
- Reason is required.
- Invalidation scope is computed from dependencies.

## VER-073 — Compare revisions

**Priority:** P1  
**Actor:** Reviewer  
**Journeys:** VJ-07

As a reviewer, I want to compare previous and remediated revisions so that I can focus on actual changes.

### Acceptance criteria
- Text and artifact changes are identifiable.
- Unchanged reused artifacts are clearly marked.
- Comparison references immutable revisions.

## VER-074 — Audit approvals and configuration

**Priority:** P0  
**Actor:** Administrator  
**Journeys:** VJ-07,VJ-14

As an administrator, I want approval/configuration history so that production decisions can be reconstructed.

### Acceptance criteria
- Audit events are append-only or equivalently tamper-evident.
- Actor and effective configuration are recorded.
- Sensitive secrets are never logged.
