# VER-EP-06 — Localization

## VER-050 — Create a localized edition

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-06

As a creator, I want to localize an approved episode into another language so that I can publish the same content internationally.

### Acceptance criteria
- Localized edition references canonical source revision.
- Language-specific artifacts are independently versioned.
- Shared language-independent assets remain reusable.

## VER-051 — Translate narration contextually

**Priority:** P0  
**Actor:** Localization Reviewer  
**Journeys:** VJ-06

As a localization reviewer, I want narration translated for natural target-language delivery so that it does not sound mechanically literal.

### Acceptance criteria
- Translation preserves meaning and genre voice.
- Timing intent is retained or explicitly rebalanced.
- Translation revision is auditable.

## VER-052 — Translate embedded text

**Priority:** P0  
**Actor:** Viewer  
**Journeys:** VJ-06

As a viewer, I want meaningful on-screen text in my language so that localized videos are fully understandable.

### Acceptance criteria
- All tracked localizable overlays are translated.
- Language-specific text is composed separately from reusable background visual when possible.
- Untranslated mandatory text is surfaced as a blocker/warning per policy.

## VER-053 — Reuse language-independent images

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-06,VJ-08

As a creator, I want language-independent images reused across locales so that localization does not pay for image regeneration.

### Acceptance criteria
- Image regeneration is not triggered solely by language change.
- Shared assets retain common lineage.
- Localized layout can overlay translated text separately.

## VER-054 — Regenerate only inseparable localized visuals

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-06,VJ-08

As the system, I want a visual regenerated only when language is inseparably embedded or layout cannot be safely recomposed so that cost remains bounded.

### Acceptance criteria
- Regeneration reason is explicit.
- System attempts composition/redesign before generation when allowed.
- Only affected localized derivatives become stale.

## VER-055 — Localize metadata and captions

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-06,VJ-10

As a creator, I want titles, descriptions, captions, chapters, and other publishable metadata localized with the episode.

### Acceptance criteria
- Metadata is versioned per locale.
- Captions align with localized narration timing.
- Publishing uses matching locale artifacts.

## VER-056 — Review localization deltas

**Priority:** P1  
**Actor:** Localization Reviewer  
**Journeys:** VJ-06,VJ-07

As a localization reviewer, I want a delta-focused review so that I do not re-review unchanged imagery.

### Acceptance criteria
- Review UI/pack distinguishes shared from localized artifacts.
- Reviewer can reject language-specific artifacts independently.
- Shared approved assets remain approved unless semantically invalidated.
