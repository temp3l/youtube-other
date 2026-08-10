# VER-EP-03 — Narration and editorial adaptation

## VER-020 — Generate episode outline

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-01,VJ-03

As a creator, I want an outline derived from the episode and sources so that the story has a coherent structure.

### Acceptance criteria
- Outline uses canonical source/episode revision.
- Outline is independently revisioned.
- Unsupported invented source assertions are not silently treated as sourced.

## VER-021 — Generate duration-bounded narration

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-03

As a creator, I want narration targeted to the requested duration so that the render fits the intended format.

### Acceptance criteria
- Narration has timing estimate.
- Duration tolerance is configurable.
- Material edits recalculate dependent timing.

## VER-022 — Adapt source wording

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-03

As a creator, I want the agent to adapt and reorganize supplied wording so that the episode is coherent rather than a verbatim slideshow.

### Acceptance criteria
- Adaptation preserves intended meaning.
- Source lineage remains available internally.
- Narration and on-screen copy are represented separately.

## VER-023 — Produce TTS-safe narration

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-03,VJ-07

As the system, I want a clean spoken script so that TTS does not read markdown headings or production metadata.

### Acceptance criteria
- Spoken payload excludes non-spoken markup.
- Pronunciation annotations use supported structured fields.
- Rendered captions can still retain semantic segmentation.

## VER-024 — Edit narration manually

**Priority:** P0  
**Actor:** Editor  
**Journeys:** VJ-03,VJ-08

As an editor, I want to edit narration and preserve the diff so that human corrections remain auditable.

### Acceptance criteria
- Edit creates/updates a draft revision.
- Diff from previous narration is available.
- Only affected downstream dependencies are invalidated.

## VER-025 — Freeze narration for production

**Priority:** P0  
**Actor:** Editor  
**Journeys:** VJ-03,VJ-07

As an editor, I want to approve/freeze narration so that expensive downstream work uses stable inputs.

### Acceptance criteria
- Frozen narration has stable hash.
- Dependent jobs reference that hash.
- Later edits create a new revision rather than mutating frozen input.
