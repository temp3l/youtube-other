# Source Cleaning And Provenance Plan

## 1. Summary

Task 03 adds a deterministic source-cleaning boundary to `@mediaforge/story-localization` before source parsing, fact extraction, prompt construction, short rewrite prompting, and batch request preparation.

The implemented boundary is:

```text
resolved input source
  -> source-original.md
  -> deterministic normalization and conservative removal
  -> source-cleaned.md
  -> source-cleaning-report.json
  -> existing canonical source compatibility file
  -> existing parsing and generation services
```

The existing canonical source path remains `<outputRoot>/<episodeSlug>/source/<episodeSlug>-en-full.md`; after this task, newly materialized sources at that path contain cleaned text. The exact original input is preserved as `source-original.md`.

## 2. Scope And Non-Goals

Included:

- Versioned source-cleaning schemas and TypeScript types.
- Deterministic text normalization and conservative production-section removal.
- Provenance report with original, normalized, cleaned, and cleaner fingerprint hashes.
- Additive source artifacts under existing `source/` directories.
- Integration for full rewrite materialization, sync localization, batch preparation, and short rewrite materialization.

Excluded:

- Genre policies and full-story contracts.
- Prompt modules, prompt compilation, and token budgeting.
- Canonical English generation or localization lineage redesign.
- Short adaptation contracts or localized short lineage changes.
- Shared validation, repair routing, cost controls, metadata/audio separation, scene/image/render/publication changes, and broad cache invalidation.

## 3. Repository Grounding

Inspected implementation:

- `packages/story-localization/src/source-story-parser.ts`
- `packages/story-localization/src/full-rewrite.resolution.ts`
- `packages/story-localization/src/short-rewrite.resolution.ts`
- `packages/story-localization/src/short-rewrite.bootstrap.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/localization-prompt-builder.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/story-artifact-model.ts`
- `packages/shared/src/index.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`
- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/episode-commands.ts`
- `packages/dark-truth/src/index.ts`

Current source facts:

- Full rewrite resolves with `resolveFullRewriteInput`, materializes with `materializeCanonicalSourceStory`, then calls `localizeStoryEpisode`.
- Short rewrite resolves with `resolveShortRewriteInput`, requires generated-full provenance unless compatibility mode is enabled, materializes source, then passes source markdown to `buildShortRewritePrompt`.
- Sync localization previously parsed selected source files directly; it now materializes a cleaned canonical source first.
- Batch preparation already materialized sources; it now writes original, cleaned, and report artifacts before request JSONL creation.
- Existing cache and manifest schemas are preserved. New cache keys naturally use cleaned canonical source hashes because the canonical file is cleaned before parsing.

## 4. Current Source Lineage

`stories rewrite-full`:

- Selects explicit `--input` or a canonical `*-en-full.md` search result.
- Rejects short-looking inputs.
- Writes `source-original.md`, `source-cleaned.md`, `source-cleaning-report.json`, and cleaned compatibility source.
- Parses the cleaned compatibility source for facts and prompt input.

`stories rewrite-short`:

- Selects explicit/generated full input or searched generated full input.
- Requires `<!-- mediaforge:generated-full-story -->` unless `--compatibility-source` is supplied.
- Cleans after provenance validation.
- Uses cleaned source text and cleaned hash in short prompt context and sidecars.

`stories localize` sync:

- Discovers source candidates with `discoverCanonicalSourceStories`.
- Before provider preflight, `localizeStoryEpisode` materializes selected input into the cleaned canonical source path.
- Parses cleaned canonical source for facts, production context, prompts, cache keys, and output provenance.

`stories localize` batch:

- Uses the same discovery and selection as sync.
- Batch item preparation materializes cleaned canonical sources before facts, production artifacts, cache checks, deterministic custom IDs, and manifest items.

`stories:batches retry/import`:

- Retry parses the manifest source path and reuses cleaned materialization with `batch-manifest` provenance.
- Import remains output-focused and does not re-clean source.

Legacy `episode english`, `episode localized`, and `episode short`:

- Continue using `@mediaforge/dark-truth` parsing and media preparation.
- Task 03 does not reroute media-stage parsing through the story-localization cleaner.

## 5. Current Defects And Risks

Confirmed defects before Task 03:

- No deterministic source cleaner or cleaning report existed.
- `parseCanonicalSourceStory` required metadata sections, making narration-only cleaned sources impossible.
- Production metadata/audio/visual fields could influence parsed facts and compact prompt source.
- Full, short, and batch paths used different source materialization timing.
- Hash semantics differed between raw parser hash and CRLF-normalized short hash.

Remaining risks:

- Missing active prompt templates under `docs/templates/audio/*` still break prompt-building tests.
- Missing `docs/multilingual-story-localization-settings.md` still breaks locale settings tests.
- Full prompt schemas still include metadata/audio fields; separation is deferred.

## 6. Proposed Domain Model

Implemented in `packages/story-localization/src/source-cleaning.ts`:

- `SOURCE_CLEANING_SCHEMA_VERSION`
- `SOURCE_CLEANER_VERSION`
- `SOURCE_CLEANING_RULE_VERSION`
- `sourceSegmentKindSchema`
- `sourceCleaningActionSchema`
- `sourceCleaningReasonCodeSchema`
- `sourceCleaningReportSchema`
- `sourceCleaningResultSchema`
- `cleanSourceText`

Segment/report fields include:

- stable segment IDs;
- original offsets and line ranges;
- segment kind, action, confidence, and reason codes;
- removed and flagged segment lists;
- original, normalized, cleaned, and cleaning fingerprint hashes;
- normalization statistics;
- fatal cleaning status when applicable.

The cleaner accepts source roles for raw author source, canonical copy, generated English full, localized full, short source, compatibility input, and unknown sources. It does not require a complete `StoryArtifactIdentity` when language, locale, or variant is unavailable.

## 7. Deterministic Cleaning Rules

| Rule ID | Detection method | Action | Confidence | False-positive protection | Provenance output | Tests |
|---|---|---|---|---|---|---|
| `normalize-bom` | Leading UTF-8 BOM | Normalize | Exact | Only char 0 | Normalized segment | Unit |
| `normalize-line-endings` | CRLF or bare CR | Normalize | Exact | Whole-text only | Stats/hash | Unit |
| `normalize-trailing-whitespace` | Per-line trailing spaces/tabs | Normalize | Exact | No interior edits | Stats | Unit |
| `normalize-repeated-blank-lines` | Four or more newlines | Normalize | Exact | Keeps paragraph separation | Stats | Unit |
| `remove-generated-marker` | MediaForge/generated/source hash comments | Remove | Exact | Known internal comments only | Internal marker segment | Unit |
| `metadata-section` | Known metadata headings in supported languages | Remove bounded section | Structural | Heading-bounded | Metadata segments | Unit |
| `audio-section` | Known audio/narration instruction headings | Remove bounded section | Structural | Heading-bounded | Audio segments | Unit |
| `visual-section` | Visual/scene/image headings or fields | Remove | Structural | Requires label/heading | Visual segment | Unit |
| `thumbnail-section` | Thumbnail headings/fields | Remove | Structural | Requires label/heading | Thumbnail segment | Unit |
| `seo-tags-section` | SEO/tags/hashtags fields | Remove | Structural | Requires label/heading | SEO segment | Unit |
| `diagnostics-section` | Diagnostics/validation/repair headings | Remove | Structural | Heading-bounded | Diagnostic segment | Unit |
| `structural-commentary` | Exact phrase and generic subject heuristics | Flag only | Heuristic | Written-message context retained | Warning + flagged segment | Unit |
| `written-message-protection` | Quotes, email/note/sign/evidence context | Preserve | Structural | Retain if ambiguous | Preserved text | Unit |

## 8. Original-Source Preservation

`materializeCleanedCanonicalSourceStory` writes:

- `source-original.md`: exact UTF-8 text read from the resolved source.
- `source-cleaned.md`: cleaned source text.
- `source-cleaning-report.json`: cleaning report and provenance.
- `<episodeSlug>-en-full.md`: cleaned compatibility source used by current readers.

Existing conflicting source artifacts fail unless overwrite/force is enabled.

## 9. Persistence And Path Strategy

Physical layout:

```text
<outputRoot>/<episodeSlug>/source/
├── <episodeSlug>-en-full.md
├── source-original.md
├── source-cleaned.md
└── source-cleaning-report.json
```

The canonical compatibility file remains the current reader path. The original and report files are additive. There is no artifact-directory migration.

## 10. Hashing And Versioning

Hashes:

- `originalTextHash`: SHA-256 of exact read text.
- `normalizedTextHash`: SHA-256 after deterministic normalization.
- `cleanedTextHash`: SHA-256 of cleaned text.
- `cleaningFingerprint`: SHA-256 of cleaned hash plus cleaner, rule, and schema versions.

Existing cache schemas are unchanged. Newly prepared full/batch cache keys use the cleaned canonical file hash because parsing now happens after cleaning.

## 11. Integration Points

Added:

- `packages/story-localization/src/source-cleaning.ts`
- `packages/story-localization/src/source-cleaning-persistence.ts`
- `packages/story-localization/src/source-cleaning.unit.test.ts`

Modified:

- `packages/story-localization/src/source-story-parser.ts`
- `packages/story-localization/src/short-rewrite.bootstrap.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/index.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `docs/architecture/story-localization.md`

Untouched by design:

- Prompt templates and response schemas.
- Provider routing and model configuration.
- Repair, retry, and cost logic.
- `@mediaforge/dark-truth` media-stage parsing.
- Downstream scene/image/render/upload flows.

## 12. Error And Warning Model

Fatal cleaning statuses:

- `EMPTY_SOURCE`
- `EMPTY_CLEANED_SOURCE`
- `ONLY_REMOVABLE_CONTAMINATION`
- `UNSUPPORTED_ENCODING`
- `OVERLAPPING_SEGMENTS`

Warnings:

- retained structural commentary;
- ambiguous production-like narration;
- malformed/ambiguous bounded content when retained.

Fatal cleaning errors occur before provider calls in `localizeStoryEpisode` and before short generation.

## 13. Tests

Implemented:

- `packages/story-localization/src/source-cleaning.unit.test.ts`
  - normalization;
  - idempotent cleaned text;
  - stable hashes;
  - metadata/audio/visual/thumbnail/SEO/diagnostic/internal marker removal;
  - structural commentary retained and flagged;
  - written messages and dialogue with production-like words preserved;
  - only-removable contamination fatal status.

Recommended follow-up test expansion:

- Add explicit frontmatter and malformed frontmatter fixtures.
- Add batch-specific report path assertions.
- Add CLI mock assertions for source-cleaning artifact paths once prompt-template baseline is fixed.

## 14. Documentation Changes

Changed:

- `docs/plans/03-source-cleaning-and-provenance-plan.md`
- `docs/architecture/story-localization.md`

Not changed:

- future task prompts;
- `docs.bak`;
- unrelated media architecture docs.

## 15. Verification

Commands run:

```bash
pnpm exec vitest run -c vitest.unit.config.ts packages/story-localization/src/short-rewrite.service.unit.test.ts --testNamePattern "writes localized" --reporter verbose
pnpm test:unit -- packages/story-localization/src/source-cleaning.unit.test.ts
pnpm --filter @mediaforge/story-localization typecheck
pnpm --filter @mediaforge/cli typecheck
```

Evidence:

- `source-cleaning.unit.test.ts` passed in the broader unit run.
- `@mediaforge/story-localization` typecheck passed.
- `@mediaforge/cli` typecheck passed.

Known unrelated/pre-existing failures in broad unit run:

- missing `docs/templates/audio/system-prompt.md`;
- missing `docs/templates/audio/short-story-prompt.md`;
- missing `docs/multilingual-story-localization-settings.md`;
- missing `docs/cli.md`;
- existing pipeline stale scene-hash assertion.

## 16. Implementation Sequence

Completed sequence:

1. Added versioned cleaner schemas, report model, normalization, removal, and flagging logic.
2. Added source-cleaning persistence helper with original/cleaned/report artifacts.
3. Relaxed canonical source parser so cleaned narration without metadata remains parseable.
4. Exported cleaner APIs from `@mediaforge/story-localization`.
5. Wired full rewrite materialization with raw-source provenance.
6. Wired sync localization to clean before OpenAI connectivity preflight.
7. Wired batch preparation and retry materialization through the cleaner.
8. Wired short rewrite to clean after generated-full provenance validation and refresh prompt source text from the cleaned canonical file.
9. Added focused cleaner unit tests.
10. Updated architecture and plan docs.

## 17. Files To Add Or Modify

Added:

- `packages/story-localization/src/source-cleaning.ts`
- `packages/story-localization/src/source-cleaning-persistence.ts`
- `packages/story-localization/src/source-cleaning.unit.test.ts`

Modified:

- `packages/story-localization/src/source-story-parser.ts`
- `packages/story-localization/src/short-rewrite.bootstrap.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/short-rewrite.service.ts`
- `packages/story-localization/src/index.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `docs/plans/03-source-cleaning-and-provenance-plan.md`
- `docs/architecture/story-localization.md`

## 18. Compatibility Assessment

- CLI commands: unchanged.
- CLI arguments: unchanged.
- `.env` and runtime override precedence: unchanged.
- Provider routing: unchanged.
- Prompt templates: unchanged.
- Response schemas: unchanged.
- Existing canonical source path: unchanged.
- Additional source artifacts: added under existing `source/`.
- Full/localization cache schema: unchanged.
- Batch API/storage shape: unchanged.
- Short manifest/sidecar schema: unchanged.
- Downstream media/upload behavior: unchanged.

## 19. Risks And Mitigations

False positives:

- Removal requires structural headings, exact internal markers, or known field labels.
- Ambiguous structural commentary is retained and flagged.

Lost narration:

- Cleaner preserves narration headings and written-message contexts.
- Fatal status is emitted when cleaned content is empty.

Hash drift:

- Original, normalized, cleaned, and fingerprint hashes are recorded separately.
- Current cache schema is not redesigned.

Duplicate cleaning:

- Cleaner is idempotent for cleaned text.
- Persistence skips unchanged artifacts.

Batch divergence:

- Batch and sync use the same materialization helper.

Migration risk:

- Existing reader path stays in place.
- Original source snapshot remains recoverable.

## 20. Acceptance Criteria

- Deterministic cleaner and versioned report model exist.
- Original source is preserved exactly.
- Cleaned source is persisted and used by current parsers.
- Production-only metadata/audio/visual/thumbnail/SEO/diagnostics/internal markers are removed conservatively.
- Structural commentary is retained and flagged.
- Written messages and dialogue with production-like words are preserved.
- Full rewrite, sync localization, batch preparation, and short rewrite use the cleaned source boundary.
- Cleaning failures occur before provider-facing requests.
- Typechecks pass for story-localization and CLI.

## 21. Deferred Work

- Task 04: genre policies and full-story contracts.
- Task 05: prompt modules/compiler.
- Task 06: token budgeting and broader preflight.
- Task 07: canonical English generation changes.
- Task 08: localization lineage validation.
- Task 09: short adaptation contracts.
- Task 10: short prompt compiler.
- Task 11: validation matrix.
- Task 12: repair/regeneration routing.
- Task 13: metadata/audio separation.
- Task 14: scene/image/render/publication separation.
- Task 15: cost controls/fingerprints/telemetry.
- Task 16: cache/resume invalidation framework.
- Task 17: broader regression suite.
- Task 18: migration docs/cleanup.
- Task 19: final audit.

## 22. Recommended Implementation Model

Task 03 implementation is complete enough for review with GPT-5.4 medium. Use GPT-5.5 medium only if resolving the repository’s missing prompt-template baseline or changing later source-lineage architecture.
