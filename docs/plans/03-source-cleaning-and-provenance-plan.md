# Deterministic Source Cleaning And Provenance Plan

## Current State

- Source discovery/materialization exists but cleaning is minimal:
  - `parseCanonicalSourceStory()` in `packages/story-localization/src/source-story-parser.ts` parses `# Episode ...`, `Narration Script`, `Episode Metadata`, and `Audio Generation Instructions`.
  - `normalizeSourceMarkdown()` / `sha256NormalizedSource()` in `packages/story-localization/src/short-rewrite.utils.ts` only normalize CRLF to LF before hashing.
  - `materializeCanonicalSourceStory()` in `packages/story-localization/src/short-rewrite.bootstrap.ts` copies the source file into `outputRoot/<episode>/source/<episode>-en-full.md`.
  - `renderLocalizedFullStory()` in `packages/story-localization/src/story-markdown-renderer.ts` writes `<!-- mediaforge:generated-full-story -->` and optional `<!-- source-sha256: ... -->`.
  - `resolveResumableFullStoryOutput()` in `packages/story-localization/src/story-localization.service.ts` checks the rendered source hash marker for resume eligibility.

- Source cleaning status today:
  - Deterministic: partially. Hashing and paragraph parsing are deterministic, but there is no deterministic source cleaner beyond line-ending normalization and section extraction.
  - Versioned: no. There is no cleaner version constant or report schema.
  - Provenance-preserving: partially. Raw/generated full provenance markers exist, but there is no cleaning provenance report, removed-section catalog, or segment id mapping.

- StoryIR/artifact baseline from prompt 02 exists:
  - `StoryIR`, `storyIrSchema`, artifact owner/variant schemas, full/short output constraints, and routing issue codes live in `packages/story-localization/src/story-artifact-model.ts`.
  - Short rewrite artifacts track `sourceSha256`, but not cleaned segment references or validated parent full-story hash.

## Gaps

- No `SourceCleaningReport` type/schema containing raw hash, normalized/cleaned hash, cleaner version, removed sections by category, narration/written-message segment ids, and warnings.
- No cleaner that classifies/removes metadata, audio, visual direction, thumbnails, tags, hashtags, diagnostics, validation notes, repair history, Markdown headings, and copied generated-full provenance markers before model prompting.
- Existing hashes are inconsistent for prompt 03 requirements:
  - `ParsedSourceStory.sourceHash` is raw `hashText(content)`.
  - `sha256NormalizedSource()` is CRLF-normalized only.
  - Cache keys and batch manifests use current source hashes, but not a cleaned-source hash or cleaner version.
- Short safeguards are incomplete for batch 1 boundaries:
  - `buildCompactStorySource()` includes `thumbnailHook` and `soundMotif`, which are not appropriate for compact short/full contract boundaries once source cleaning is introduced.
  - Short contracts do not record cleaned segment references.

## Remaining Tasks

1. Add deterministic source cleaning and provenance model.
   - Likely files: `packages/story-localization/src/source-story-cleaner.ts`, `story-localization.types.ts`, `story-localization.schemas.ts`, `source-story-parser.ts`.
   - Define `SOURCE_CLEANER_VERSION`, cleaned-source/report schemas, removed-section categories, segment id shape, and warning shape.
   - Cleaner behavior:
     - Normalize line endings and whitespace deterministically.
     - Extract narration paragraphs as cleaned narration segments with stable ids.
     - Preserve exact written messages as segment references.
     - Classify and remove production-only sections: metadata, audio, visual, thumbnail, tags, hashtags, diagnostics, validation notes, repair history, generated full-story markers, and non-narration Markdown headings.
     - Emit ambiguous-section warnings without calling OpenAI.
   - Keep `parseCanonicalSourceStory()` public behavior compatible, but enrich returned parsed data or expose a parallel cleaner result so existing callers do not break.

2. Wire cleaning into preflight, materialization, hashing, and caches.
   - Likely files: `source-story-parser.ts`, `short-rewrite.bootstrap.ts`, `story-localization.service.ts`, `story-localization-batch-service.ts`, `full-rewrite.resolution.ts`, `short-rewrite.resolution.ts`.
   - Run cleaning immediately after source resolution and before any paid request.
   - Persist a source-cleaning report under the existing episode/cache production area, likely beside `source-analysis.json`.
   - Use the cleaned/normalized source hash plus cleaner version in canonical full cache keys and batch manifest source identity so raw source changes invalidate canonical full and downstream outputs.
   - Preserve existing CLI paths and rendered Markdown compatibility; add provenance fields rather than renaming current artifacts.

3. Add targeted validation, no paid API calls.
   - Source cleaner tests:
     - metadata/audio/visual/thumbnail/tags/hashtags removal
     - diagnostics/repair-history removal
     - generated-full marker handling
     - stable raw/cleaned hashes and cleaner version
     - stable narration/written-message segment ids
     - preflight failure before OpenAI client call
   - Suggested commands:
     - `pnpm test --filter @mediaforge/story-localization -- source-story-cleaner`
     - `pnpm test --filter @mediaforge/story-localization -- story-localization`

## Decision Points

- Store source-cleaning reports in the episode production cache by default, with artifact paths unchanged. This preserves CLI/artifact compatibility while adding provenance.
- Treat `cleanedSourceHash + cleanerVersion` as the new generation/cache identity for canonical full and downstream outputs. Keep raw hash in reports for audit and invalidation explanation.
- Do not change public CLI paths or rendered Markdown artifact names for batch 1.

## Done Criteria

- Narration prompts use cleaned narration/contract only and exclude metadata, audio, visual, thumbnail, tags, hashtags, diagnostics, and repair history.
- Source cleaning is deterministic and versioned via `SOURCE_CLEANER_VERSION`.
- Cleaning report persists raw hash, cleaned hash, removed categories, segment ids, and warnings.
- Raw source or cleaned output changes invalidate canonical full and downstream cache entries.
- Preflight cleaning failures happen before any OpenAI request.
