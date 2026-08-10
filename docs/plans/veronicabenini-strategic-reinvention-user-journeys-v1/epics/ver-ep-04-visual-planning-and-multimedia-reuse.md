# VER-EP-04 — Visual planning and multimedia reuse

## VER-030 — Derive scene visual plan

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-04

As the production system, I want a scene-level visual plan aligned to narration so that assets and timing are coherent.

### Acceptance criteria
- Every scene maps to narration/time range.
- Visual type is explicit.
- Plan records source/generated/reused intent.

## VER-031 — Prefer relevant source media

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-02,VJ-04

As a creator, I want supplied media reused when it fits so that original material is preserved and generation cost is reduced.

### Acceptance criteria
- System considers source media before generated replacement.
- Reuse requires semantic relevance.
- Unsuitable source media can be redesigned without overwriting the original.

## VER-032 — Redesign source slides

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-04,VJ-05,VJ-06

As a creator, I want source slides to be redesigned when needed for clarity so that they work as video visuals.

### Acceptance criteria
- Meaning and required content are preserved.
- Redesign is represented as a derivative with lineage.
- Original source remains immutable.

## VER-033 — Derive camera/image direction once

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-04,VJ-08

As the system, I want episode-level camera/image direction derived from relevant context and cached so that image generation remains coherent and does not repeat expensive analysis.

### Acceptance criteria
- Direction considers relevant topic/time/place/style inputs.
- Result is persisted by compatible input hash.
- Regeneration reuses it unless a relevant dependency changes.

## VER-034 — Attach reference images only when relevant

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-04

As the system, I want reference images attached only to visual prompts that require them so that prompts remain efficient and semantically focused.

### Acceptance criteria
- Reference attachment requires explicit relevance.
- Unrelated scenes receive no reference payload.
- Lineage identifies reference source.

## VER-035 — Support heterogeneous visual types

**Priority:** P1  
**Actor:** Creator  
**Journeys:** VJ-04

As a creator, I want the plan to mix source visuals, generated imagery, diagrams, typography, and redesigned slides so that episodes avoid repetitive visual treatment.

### Acceptance criteria
- Visual type is scene-specific.
- Plan supports at least the configured media classes.
- Validation can flag excessive structural repetition.

## VER-036 — Review visual plan before generation

**Priority:** P1  
**Actor:** Editor  
**Journeys:** VJ-04,VJ-07

As an editor, I want to review the visual plan before expensive generation so that obvious mistakes are caught cheaply.

### Acceptance criteria
- Policy can require pre-generation approval.
- Rejected scenes can be corrected independently.
- Approved plan revision is captured by downstream jobs.
