# VER-EP-02 — Source ingestion and extraction

## VER-010 — Upload mixed source assets

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-02

As a creator, I want to attach PDFs, slide decks, documents, images, and screenshots so that the episode can be source-driven.

### Acceptance criteria
- Each upload receives a content fingerprint.
- Source type and immutable metadata are stored.
- Failure of one asset does not discard valid assets.

## VER-011 — Deduplicate identical sources

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-02,VJ-09

As the system, I want identical source content deduplicated so that extraction and storage are not repeated.

### Acceptance criteria
- Deduplication uses content identity, not filename alone.
- References from multiple episodes remain valid.
- Extraction outputs may be reused when policy/config inputs match.

## VER-012 — Extract source structure

**Priority:** P0  
**Actor:** System  
**Journeys:** VJ-02

As the system, I want to extract page/slide/text/media structure so that downstream agents can reason about source material.

### Acceptance criteria
- Extraction result is structured and versioned.
- Page/slide coordinates are retained where relevant.
- Original files are never modified.

## VER-013 — Classify source usage policy

**Priority:** P0  
**Actor:** Creator  
**Journeys:** VJ-02,VJ-04

As a creator, I want to mark assets as mandatory, optional, context-only, or forbidden-for-display so that the agent respects editorial constraints.

### Acceptance criteria
- Policy is stored per source or sub-resource.
- Forbidden-for-display material cannot enter final visual outputs.
- Context-only content may influence narration if authorized.

## VER-014 — Reuse prior extraction

**Priority:** P1  
**Actor:** System  
**Journeys:** VJ-02,VJ-08

As the system, I want unchanged source extraction reused so that repeated runs do not incur duplicate processing.

### Acceptance criteria
- Reuse is based on source hash plus extraction-version compatibility.
- Reason for reuse is recorded.
- Forced re-extraction is explicit.

## VER-015 — Track source-to-output lineage

**Priority:** P0  
**Actor:** Reviewer  
**Journeys:** VJ-02,VJ-07

As a reviewer, I want to see which source items influenced narration and visuals so that I can audit the episode.

### Acceptance criteria
- Lineage links support page/slide-level references when available.
- Generated derivatives retain source references.
- Review pack exposes lineage without leaking hidden system data.
