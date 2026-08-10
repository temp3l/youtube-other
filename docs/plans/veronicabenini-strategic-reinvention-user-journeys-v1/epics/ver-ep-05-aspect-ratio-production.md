# VER-EP-05 — Aspect-ratio production

## VER-040 — Create 16:9 composition

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-05

As a creator, I want a 16:9 edition so that the episode is suitable for standard YouTube viewing.

### Acceptance criteria
- Uses canonical narration/content revision.
- Text respects configured safe areas/readability.
- Shared visual assets are reused where compatible.

## VER-041 — Create 9:16 composition

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-05

As a creator, I want a 9:16 edition so that the same episode can produce vertical content.

### Acceptance criteria
- Vertical layout is independently composed.
- Text is not merely scaled from 16:9.
- Source slides can be recomposed for mobile readability.

## VER-042 — Share semantic content across formats

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-05,VJ-08

As the system, I want both aspect ratios linked to the same semantic revision so that format derivatives do not diverge editorially.

### Acceptance criteria
- Both formats reference same canonical narration revision unless explicitly forked.
- Layout-only changes do not alter canonical narration.
- Format-specific approval status is supported.

## VER-043 — Validate mobile readability

**Priority:** P1  
**Actor:** Reviewer  
**Journeys:** VJ-05,VJ-07

As a reviewer, I want vertical text/safe-area validation so that 9:16 output is usable on phones.

### Acceptance criteria
- Checks detect clipping/unsafe margins.
- Configurable minimum text readability exists.
- Defects are reported per scene/frame.
