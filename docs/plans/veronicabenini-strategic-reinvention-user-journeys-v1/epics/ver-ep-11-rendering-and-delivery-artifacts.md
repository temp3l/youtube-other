# VER-EP-11 — Rendering and delivery artifacts

## VER-100 — Render with FFmpeg pipeline

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-05,VJ-10

As an operator, I want approved assets rendered through the FFmpeg-based renderer so that outputs are reproducible.

### Acceptance criteria
- Render captures inputs/config/tool version.
- Render is deterministic within supported limits.
- Failure leaves inspectable logs and does not corrupt source artifacts.

## VER-101 — Render per format and locale

**Priority:** P0  
**Actor:** Operator  
**Journeys:** VJ-05,VJ-06,VJ-11

As an operator, I want format/locale outputs rendered independently so that one failed derivative does not block all editions.

### Acceptance criteria
- Render unit includes locale and aspect ratio.
- Shared upstream assets are referenced, not duplicated unnecessarily.
- Status is independent per derivative.

## VER-102 — Produce delivery bundle

**Priority:** P1  
**Actor:** Creator  
**Journeys:** VJ-10

As a creator, I want a downloadable delivery bundle so that I can publish outside the automated integration if needed.

### Acceptance criteria
- Bundle includes final media and configured metadata/captions.
- Manifest identifies production revision.
- Sensitive internal-only artifacts are excluded.

## VER-103 — Generate render previews

**Priority:** P1  
**Actor:** Reviewer  
**Journeys:** VJ-07

As a reviewer, I want low-cost previews before final delivery so that layout/timing defects are caught earlier.

### Acceptance criteria
- Preview is linked to same composition revision.
- Preview generation can use lower-cost settings.
- Approval pack identifies preview vs final render.
