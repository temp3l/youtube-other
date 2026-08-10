# VER-EP-01 — Episode creation and lifecycle

## VER-001 — Create an episode

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-01,VJ-12

As a creator, I want to create a Veronica episode with a working title and production defaults so that I can start from a canonical revision.

### Acceptance criteria
- Creates exactly one canonical episode for an idempotent request.
- Persists genre/version/default-language metadata.
- Initial status is explicit and machine-readable.

## VER-002 — Clone an episode safely

**Priority:** P1  
**Actor:** Creator  
**Journeys:** VJ-01,VJ-08

As a creator, I want to clone a prior episode as a new draft so that I can reuse structure without mutating the original.

### Acceptance criteria
- Original revision remains immutable.
- Clone records parent lineage.
- Episode-specific generated assets are not reused unless dependency-compatible.

## VER-003 — Version episode changes

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-01,VJ-07,VJ-08

As a creator, I want material edits to create a new production revision so that approved history remains auditable.

### Acceptance criteria
- Approved revisions cannot be overwritten.
- Revision has stable identifier and parent reference.
- Changed fields are diffable.

## VER-004 — Archive an episode

**Priority:** P1  
**Actor:** Creator  
**Journeys:** VJ-01,VJ-12

As a creator, I want to archive an episode without deleting its lineage so that inactive work is removed from normal queues.

### Acceptance criteria
- Archive is reversible when policy allows.
- Artifacts and audit history remain available.
- Archived episodes cannot publish accidentally.

## VER-005 — Apply versioned genre defaults

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-01,VJ-14

As the production system, I want every run to capture the effective Veronica genre configuration so that output is reproducible.

### Acceptance criteria
- Run stores immutable effective-config identifier.
- Later config changes do not alter old revisions.
- Defaults can be overridden only by authorized explicit settings.
