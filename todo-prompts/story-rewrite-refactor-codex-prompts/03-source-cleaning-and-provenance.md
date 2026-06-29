# Task: Deterministic Source Cleaning And Provenance

Work on source normalization before any paid generation. Preserve current source discovery behavior unless a defect is documented.

## Objective

Create deterministic source cleaning that strips production-only material from narration inputs while preserving provenance for StoryIR, full generation, localization, and short contracts.

## Requirements

Clean and classify:

- narration paragraphs;
- metadata blocks;
- audio instructions;
- tags, hashtags, thumbnails, visual direction;
- headings and Markdown;
- diagnostics, validation notes, repair history;
- copied generated full-story provenance markers.

Persist a source-cleaning report with:

- raw source hash;
- normalized source hash;
- cleaner version;
- removed sections by category;
- segment ids for narration and written messages;
- warnings for ambiguous sections.

## Full And Short Impact

- Full-story generation may use cleaned narration plus StoryIR facts.
- Short generation must never receive raw full Markdown when a compact short contract is sufficient.
- Short contracts must record the validated parent full-story hash and cleaned segment references.

## Tests

Add tests for:

- metadata/audio/visual removal;
- preservation of written messages;
- stable hashes;
- provenance segment ids;
- generated full-story marker handling;
- no paid call when source preflight fails.

## Acceptance Criteria

- Narration prompts do not receive metadata, audio, visual, thumbnail, tags, hashtags, diagnostics, or repair history.
- Cleaning is deterministic and versioned.
- Raw source changes invalidate canonical full and everything downstream.
