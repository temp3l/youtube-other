# Task 07: Canonical English Full Generation Plan

## 1. Scope And Non-Goals

### Scope

Task 07 implements `todo-prompts/story-rewrite-refactor-codex-prompts/07-canonical-english-full-generation.md`: make canonical English full narration a first-class, validated artifact generated only from cleaned English source, StoryIR, the full-story contract, the Task 05 compiler, and the Task 06 preflight gate.

In scope:

- Preserve `stories rewrite-full` as the public CLI entry point while giving it a dedicated canonical-English-full persistence and resume path.
- Treat StoryIR as the canonical semantic input and English full narration as the canonical parent for downstream localized full and short work.
- Use the Task 05 modular full compiler and the Task 06 shared preflight/admission logic; do not duplicate either.
- Enforce narration-only provider I/O for full-story generation.
- Persist canonical English full lineage, validation, repair history, token/cost usage, and parent hashes in canonical new-write formats.
- Keep valid canonical outputs stable across downstream failures and blocked operations.
- Add compatibility reads for legacy full outputs and batch results where needed so existing workflows remain operable during migration.

### Non-goals

Task 07 does not own:

- localized full lineage redesign and locale-parent validation beyond what is required to consume canonical English full safely; that remains Task 08;
- short adaptation contracts, short prompt compilation, or short persistence redesign; that remains Tasks 09 and 10;
- shared validation-matrix expansion beyond the full-generation checks required here; that remains Task 11;
- repair-routing architecture beyond the canonical full route needed here; broader routing remains Task 12;
- metadata, audio, image, scene, render, or publication prompt ownership;
- changing public CLI names, removing current artifact paths, changing `.env` precedence, or starting Task 08+ implementation.

## 2. Dependencies On Tasks 01-06

- Task 01 baseline:
  `docs/plans/story-rewrite-repository-analysis-and-baseline-plan.md` established the current full/short call graphs and the requirement to preserve CLI compatibility.
- Task 02 artifact model:
  `packages/story-localization/src/story-artifact-model.ts` already provides `StoryIR`, artifact variants, output-constraint types, and issue types that Task 07 must consume instead of re-deriving semantic structure.
- Task 03 source cleaning:
  `prepareCleanedInputStory()` in [packages/story-localization/src/story-localization.service.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-localization.service.ts) already materializes cleaned canonical source under `episode/source/<slug>-en-full.md`. Task 07 must treat that cleaned source as the only upstream text input.
- Task 04 genre policy and full-story contract:
  `genre-policy.ts` and `full-story-contract.ts` already exist and are already reachable through the Task 05 compiler. Task 07 should not bypass them with ad hoc prompt assembly.
- Task 05 modular prompt compiler:
  `compileFullStoryPrompt()` in [packages/story-localization/src/story-prompt-compiler.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-prompt-compiler.ts) is the prompt owner for full generation. Task 07 must call it and persist its compiler/schema fingerprints.
- Task 06 preflight:
  `runStoryGenerationPreflight()` and the sync/batch preflight adapters already cover `canonical-english-full`, `localized-full`, and repair variants. Task 07 must reuse those hooks and persist their outcomes rather than adding a second estimator path.

## 3. Repository Findings And Current Flows

### Canonical English full sync path today

- `apps/cli/src/story-full-rewrite-command.ts`
  - `registerStoryRewriteFullCommand()`
  - resolves input via `resolveFullRewriteInput()`
  - materializes the canonical cleaned source via `materializeCanonicalSourceStory()`
  - calls `createStoryLocalizationConfig()` with:
    - `includeEnglishShort: false`
    - `includeLocalizedShorts: false`
    - `processingMode: "sync"`
    - `debugOutputs: true`
  - invokes `localizeStoryEpisode()`
- `packages/story-localization/src/story-localization.service.ts`
  - `prepareCleanedInputStory()` reparses/writes cleaned canonical source
  - `buildFullPromptConfig()` calls `compileFullStoryPrompt()`
  - `generateStructuredStoryPackage()` runs Task 06 preflight, provider call, validation, and repair
  - English full uses `responseSchemaForFullLanguage("en")` and `variant: "canonical-english-full"`
  - output is normalized via `parseLocalizedFullRewritePackage()`
  - compatibility rendering happens through `adaptNarrationOnlyFullToLegacyRendererPackage()` plus `renderLocalizedFullStory()`
  - persisted English output is still root `episode/script.md`
  - resume checks still key off the cache entry plus the rendered markdown marker and then reparses `script.md`

### Legacy localized full and batch flows today

- `apps/cli/src/story-localization-commands.ts`
  - `stories localize` defaults to `processingMode: "batch"` and `includeEnglishShort: true`
  - legacy `stories localize` still orchestrates English short plus localized full and sometimes localized short generation together
- `packages/story-localization/src/story-localization.service.ts`
  - `localizeStoryEpisode()` still contains one shared orchestration path for:
    - canonical English full
    - optional English short
    - localized full
    - optional localized short
- `packages/story-localization/src/story-localization-batch-service.ts`
  - `prepareStoryLocalizationBatch()` currently builds:
    - optional `english-short` items
    - `localization` items for non-English full generation
  - there is no first-class `canonical-english-full` batch item
  - batch localization already compiles prompts through `compileFullStoryPrompt()`
  - batch localization already expects the narration-only schema for localized full requests
  - batch import normalizes legacy mixed/full-only payloads with `normalizeNarrationOnlyBatchResult()`

### Provider, parsing, validation, and repair today

- Provider invocation is centralized in:
  - `callOpenAiStructured()`
  - `generateStructuredStoryPackage()`
- Full-only schema exists in:
  - `narrationOnlyFullRewriteResponseSchema`
  - `fullNarrationResponseSchemaDescriptor`
- Validation for narration-only full responses exists in:
  - `validateNarrationOnlyFullRewritePackage()`
  - `validateGeneratedFullStoryPackage()`
- Repair remains generic:
  - `generateStructuredStoryPackage()` runs one repair call by default, plus a second repair only when `shouldRetry` is supplied for specific flows
  - canonical English full is still using the generic full repair route, not a distinct canonical-full persistence envelope

### Persistence and resume today

- Output path resolution:
  - `resolveEpisodeStoryOutputFiles()` returns root `script.md` for English full and `/<lang>/full/script.md` for localized full.
- Cache:
  - `story-localization-cache.ts` stores `sourceHash`, `configurationHash`, `promptVersion`, `model`, and output file paths.
- Resume:
  - `resolveResumableFullStoryOutput()` checks cache entry metadata and the `source-sha256` marker in rendered markdown.
  - English resume reparses the rendered compatibility markdown back into a source-story shape.
- Batch manifests:
  - `localBatchManifestItemSchema` already captures compiler/schema fingerprints for localized full items, but there is no canonical-English-full operation or manifest schema yet.

## 4. Canonical, Compatibility, Duplicate, Deprecated, And Uncertain Paths

### Canonical paths already in place

- Canonical cleaned English source:
  `episode/source/<episode-slug>-en-full.md`
- Canonical semantic input:
  `StoryIR` in `story-artifact-model.ts`
- Canonical full prompt compiler:
  `compileFullStoryPrompt()`
- Canonical full provider schema:
  `narrationOnlyFullRewriteResponseSchema`
- Canonical preflight operation variant:
  `canonical-english-full`

### Compatibility paths that Task 07 must keep readable

- Root English compatibility markdown:
  `<episode>/script.md`
- Legacy batch full payloads:
  `legacyMixedBatchStoryResultSchema`
  and
  `legacyFullOnlyBatchStoryResultSchema`
- Compatibility renderer adapter:
  `adaptNarrationOnlyFullToLegacyRendererPackage()`
- Legacy orchestration surface:
  `stories localize`

### Duplicate or conflicting paths today

- Full generation routing exists in both:
  - `stories rewrite-full` sync path
  - `stories localize`/batch localization path
- Prompt construction has two full-facing layers:
  - `buildFullPromptConfig()`
  - `buildLocalizationPrompt()`
  The compiler is authoritative; Task 07 should reduce compatibility wrappers, not add another prompt layer.
- Persistence identity is split between:
  - cache entries in `.localization-cache`
  - rendered markdown markers in `script.md`
  - batch manifest metadata
  There is no single canonical full artifact envelope yet.

### Deprecated paths to contain, not extend

- `includeLocalizedShorts` in full-generation orchestration
- combined full+short provider schemas in legacy localized flows
- reparsing rendered compatibility markdown to recover canonical English full state

### Uncertain paths discovered in repo

- Active CLI/tests still support `fr`; the Task 07 prompt centers `es`, `de`, and `pt`, but implementation must not regress French unless a later migration removes it explicitly.
- `short-rewrite.prompt.ts` still depends on legacy `docs/templates/audio/*`; Task 07 should not spread that dependency into canonical English full generation.
- There is no existing canonical full manifest path or schema; Task 07 must introduce one in a way that does not break current consumers of `script.md`.

## 5. Gaps And Failure Modes

- Canonical English full is not persisted as its own artifact envelope; only rendered compatibility markdown and cache metadata survive.
- `localizeStoryEpisode()` still mixes canonical English full generation with English short and localized short orchestration; this keeps full-generation ownership blurry.
- The rendered English markdown includes metadata/audio/visual compatibility sections injected from source metadata through `renderLocalizedFullStory()`. The provider output is narration-only, but the persisted public artifact is not a pure canonical narration artifact.
- Resume uses rendered markdown reparse instead of a dedicated validated canonical artifact, so stale canonical full cannot be rejected by lineage metadata alone.
- Downstream invalidation is implicit. There is no canonical manifest that marks localized full and short artifacts stale when English canonical full changes.
- Batch mode has no `canonical-english-full` item type, so there is no way to import or retry canonical English full generation independently.
- Failed localized generation can preserve failed artifacts, but there is no equivalent typed preservation envelope for failed canonical English full attempts.
- Validation exists, but the current tests do not prove the Task 07 acceptance case "resume rejects stale canonical full" via a dedicated canonical full parent manifest.

## 6. Target Architecture And Module Boundaries

### Architecture

Split canonical English full generation into an explicit narration-stage module with this flow:

```text
resolved input
  -> cleaned canonical source
  -> StoryIR + genre policy + full-story contract
  -> Task 05 compiled full prompt
  -> Task 06 preflight
  -> narration-only provider response
  -> deterministic full validation
  -> optional canonical-full repair
  -> canonical English full artifact + manifest
  -> compatibility markdown projection
  -> downstream localization/short consumers
```

### Boundary decisions

- `story-prompt-compiler.ts` remains the only prompt owner.
- `story-generation-preflight.ts` remains the only token-estimation/preflight owner.
- `story-localization.service.ts` should orchestrate, but canonical full persistence, resume, compatibility projection, and manifest logic should move into a focused module rather than growing the existing service further.
- `story-markdown-renderer.ts` should render compatibility markdown from a canonical artifact; it should not be the source of truth for canonical full state.
- Batch service should consume the same canonical full artifact schema and persistence helpers as sync mode.

### Proposed module split

- New module:
  `packages/story-localization/src/canonical-full-story.persistence.ts`
  - canonical artifact schema I/O
  - manifest hashing/fingerprinting
  - compatibility markdown projection
  - atomic write/promote helpers
  - resume/staleness checks
- Existing orchestrator keeps:
  - prompt compilation
  - preflight call-in
  - provider/repair loop
  - downstream orchestration hooks

## 7. Canonical Interfaces And Schemas

### Canonical full artifact interfaces to add

- `CanonicalEnglishFullArtifact`
  - artifact identity: episode number, slug, language `en`, locale `en-US`, variant `full`
  - parent lineage: cleaned source hash, StoryIR hash, full-story-contract hash
  - prompt lineage: compiler version, prompt version, prompt fingerprint, selected modules
  - provider lineage: model, reasoning effort, max output tokens, schema name/version/fingerprint
  - validated narration payload:
    - `language`
    - `full.narrationParagraphs`
    - `targetNarrationWpm`
    - `preservationChecklist`
    - `diagnostics`
  - validation status and issue list
  - repair history and attempts
  - token usage and estimated cost
  - status: `completed`, `failed`, or `blocked-preflight`

- `CanonicalEnglishFullManifest`
  - pointer/hash for current canonical artifact
  - compatibility markdown path/hash
  - latest successful attempt metadata
  - last failed attempt metadata without invalidating the last valid artifact
  - downstream invalidation fingerprint for localized full and short consumers

### Compatibility interfaces to retain

- Keep reading:
  - legacy localized/full batch payloads via `normalizeNarrationOnlyBatchResult()`
  - root `script.md` for older consumers
- New writes should use the canonical artifact/manifest first, then derive compatibility markdown.

### Path contract to adopt

- Canonical new-write English full paths:
  - `<episode>/en/full/script.md`
  - `<episode>/en/full/canonical-full.json`
  - `<episode>/en/full/generation-manifest.json`
- Compatibility projection path retained:
  - `<episode>/script.md`

This is the Task 07 migration boundary: canonical English full gains a real home under `en/full`, while the historical root `script.md` remains as a compatibility projection.

## 8. File-By-File Change Plan

### [packages/story-localization/src/story-localization.service.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-localization.service.ts)

- Symbols:
  `localizeStoryEpisode()`, `resolveResumableFullStoryOutput()`, `buildFullStoryPreflightAdapter()`
- Current responsibility:
  shared sync orchestration for English full, localized full, and optional shorts; cache-based resume; provider call and repair.
- Proposed change:
  - extract canonical-English-full persistence/resume decisions behind a new helper module;
  - generate and validate canonical English full first;
  - write canonical artifact + manifest + compatibility markdown;
  - use canonical manifest fingerprint as the parent identity for downstream localized/full and short reads;
  - stop reparsing root compatibility markdown as the canonical source of truth.
- Reason:
  this is the main ownership split required by Task 07.
- Compatibility impact:
  preserve `stories rewrite-full` behavior and root `script.md`; add new canonical files.
- Required tests:
  sync full-only generation, failed validation preservation, stale resume rejection, downstream parent-fingerprint invalidation.

### [packages/story-localization/src/story-localization-batch-service.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-localization-batch-service.ts)

- Symbols:
  `prepareStoryLocalizationBatch()`, `buildBatchItems()`, `importStoryLocalizationBatch()`, `buildLocalizationBatchItem()`
- Current responsibility:
  batch prep/import for localized full and optional English short; localized full already uses Task 05 compiled narration-only schema.
- Proposed change:
  - add a canonical-English-full batch item/operation and manifest metadata;
  - import canonical English full into the same artifact/manifest schema used by sync mode;
  - make localized full batch items depend on the canonical English full artifact fingerprint instead of only the cleaned source hash;
  - keep compatibility reads for older manifests/results.
- Reason:
  Task 07 requires canonical full to be first-class in both sync and batch orchestration.
- Compatibility impact:
  new manifests include canonical-full metadata; legacy manifests remain readable.
- Required tests:
  batch prepare/import for canonical English full, manifest fingerprint persistence, retry behavior, legacy batch result normalization.

### [packages/story-localization/src/story-localization.schemas.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-localization.schemas.ts)

- Symbols:
  `localBatchManifestItemSchema`, related manifest schemas
- Current responsibility:
  runtime schemas for generated packages and batch manifests.
- Proposed change:
  add canonical English full artifact and manifest schemas; extend batch operation/item schemas for `canonical-english-full` and parent canonical manifest fingerprints.
- Reason:
  runtime-validated persistence is required for compatibility-read-only migration.
- Compatibility impact:
  additive schemas only; legacy fields remain optional/readable.
- Required tests:
  schema parse for new artifact/manifest and compatibility parse for old manifests.

### [packages/story-localization/src/story-localization.types.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-localization.types.ts)

- Symbols:
  `BatchOperation`, batch manifest item/result types, localization result types
- Current responsibility:
  shared story-localization TS contracts.
- Proposed change:
  add canonical full artifact/manifest/result types and batch operation enum value; thread canonical parent fingerprint through downstream types.
- Reason:
  code should not pass lineage through untyped records.
- Compatibility impact:
  additive.
- Required tests:
  indirect through unit/integration coverage.

### [packages/story-localization/src/story-prompt-response-schemas.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-prompt-response-schemas.ts)

- Symbols:
  `narrationOnlyFullRewriteResponseSchema`, `normalizeNarrationOnlyBatchResult()`, `adaptNarrationOnlyFullToLegacyRendererPackage()`
- Current responsibility:
  provider-response schema ownership and batch-result normalization.
- Proposed change:
  keep narration-only schema as canonical provider contract; add helpers to wrap validated responses into canonical English full artifact envelopes; retain compatibility adapter explicitly outside the provider contract.
- Reason:
  Task 07 should not let compatibility rendering redefine the provider schema.
- Compatibility impact:
  additive; no schema broadening.
- Required tests:
  full-only schema remains narration-only; artifact envelope builder serializes expected lineage fields.

### [packages/story-localization/src/generated-story-validator.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/generated-story-validator.ts)

- Symbols:
  `validateNarrationOnlyFullRewritePackage()`, `validateGeneratedFullStoryPackage()`
- Current responsibility:
  deterministic validation for generated outputs.
- Proposed change:
  add explicit canonical-full issue coverage for missing climax/ending and route-safe validation helpers that operate on the canonical artifact payload.
- Reason:
  Task 07 acceptance explicitly calls out missing climax or ending.
- Compatibility impact:
  stronger deterministic validation; no CLI change.
- Required tests:
  missing climax/ending blocks canonical full completion.

### [packages/story-localization/src/story-markdown-renderer.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-markdown-renderer.ts)

- Symbols:
  `renderLocalizedFullStory()`
- Current responsibility:
  render compatibility full markdown with metadata/audio/visual sections.
- Proposed change:
  add a canonical-English-full compatibility renderer that derives from the canonical artifact manifest and clearly separates compatibility projection from source-of-truth persistence.
- Reason:
  root/script compatibility must survive, but it cannot be the canonical artifact itself.
- Compatibility impact:
  existing root `script.md` remains.
- Required tests:
  rendered compatibility markdown still contains provenance marker and expected headings.

### [packages/story-localization/src/story-localization-cache.ts](/home/arch/workspace/youtube-other/packages/story-localization/src/story-localization-cache.ts)

- Symbols:
  `resolveEpisodeStoryOutputFiles()`, cache entry helpers
- Current responsibility:
  output-path resolution and cache entry I/O.
- Proposed change:
  add canonical-English-full path helpers and cache fields/helpers keyed by canonical manifest fingerprint, without breaking current readers.
- Reason:
  cache and resume need a canonical parent artifact identity.
- Compatibility impact:
  additive.
- Required tests:
  path resolution for `en/full` plus compatibility root path.

### [apps/cli/src/story-full-rewrite-command.ts](/home/arch/workspace/youtube-other/apps/cli/src/story-full-rewrite-command.ts)

- Symbols:
  `registerStoryRewriteFullCommand()`
- Current responsibility:
  public CLI surface for rewrite-full sync orchestration.
- Proposed change:
  keep public flags/output stable; update dry-run reporting to include the canonical `en/full` artifact paths while still showing the root compatibility markdown.
- Reason:
  public behavior stays stable, but the new canonical artifact should be visible.
- Compatibility impact:
  non-breaking additive dry-run/report detail.
- Required tests:
  existing full-only CLI test plus canonical-path assertions.

### [apps/cli/src/story-localization-commands.ts](/home/arch/workspace/youtube-other/apps/cli/src/story-localization-commands.ts)

- Symbols:
  `commandStoriesLocalize()`, batch command handlers
- Current responsibility:
  legacy sync/batch localization orchestration.
- Proposed change:
  thread canonical-English-full batch items/manifests through the existing batch UX without renaming commands.
- Reason:
  legacy batch entry points must operate against the new canonical full stage.
- Compatibility impact:
  command names and flags preserved.
- Required tests:
  batch prepare/import command path coverage remains green.

### New tests

- `packages/story-localization/src/canonical-full-story.persistence.unit.test.ts`
- targeted additions to:
  - `story-localization.unit.test.ts`
  - `story-localization.integration.test.ts`
  - `story-localization.batch.integration.test.ts`
  - `story-prompt-response-schemas.unit.test.ts`
  - `story-generation-preflight.unit.test.ts`
  - `apps/cli/src/story-full-rewrite-command.unit.test.ts`

## 9. Integration With Prompt Compilation And Token Preflight

- Prompt compilation:
  - `compileFullStoryPrompt()` remains the only way to build canonical English full prompts.
  - Persist:
    - `compilerVersion`
    - `promptVersion`
    - `promptFingerprint`
    - `selectedModules`
    - `responseSchema` name/version/fingerprint
- Token preflight:
  - reuse `buildFullStoryPreflightAdapter()` / `runStoryGenerationPreflight()`
  - keep `variant: "canonical-english-full"` for initial generation and `variant: "full-repair"` for repair attempts
  - persist the preflight request fingerprint and blocked outcomes in the canonical full manifest
  - do not add an alternate estimator or special-case tokenizer
- Provider contract:
  - full-story provider input remains narration-only
  - provider output remains narration-only
  - metadata/audio/image/render/publication instructions remain excluded from the compiled prompt and the response schema

## 10. Sync And Batch Migration

### Sync

- `stories rewrite-full` becomes the canonical writer for:
  - `en/full/canonical-full.json`
  - `en/full/generation-manifest.json`
  - `en/full/script.md`
  - root compatibility `script.md`
- localized full generation within the same command reads the validated canonical manifest/artifact rather than reparsing root compatibility markdown

### Batch

- Add canonical-English-full batch preparation/import before localized full retry/import logic.
- Keep `stories:batches` command names and manifest/index locations unchanged.
- Batch import must:
  - normalize provider results to the narration-only schema
  - write the canonical artifact first
  - then project compatibility markdown
  - only then mark the manifest item persisted
- Existing legacy batch manifests/results remain compatibility-read only.

## 11. Persistence, Atomicity, Resume, And Fingerprint Behavior

- Writes must be atomic:
  - stage canonical JSON/manifest/markdown under temp files
  - promote only after validation passes
- Fingerprints to persist:
  - cleaned source hash
  - StoryIR hash
  - full-story-contract hash
  - prompt fingerprint
  - schema fingerprint
  - model config
  - usage/cost summary
- Resume should check:
  - canonical artifact presence
  - manifest status `completed`
  - matching lineage hashes and prompt/model fingerprints
  - compatibility markdown hash/path only as a derived consistency check
- Resume rejection rule:
  - if the canonical manifest fingerprint differs from the last localized/short parent fingerprint, downstream artifacts become stale and are skipped only as stale, never treated as valid cache hits
- Valid artifact survival:
  - a failed repair/regeneration attempt must not delete or overwrite the last valid canonical artifact
  - the latest failed attempt metadata may update the manifest, but success pointers stay on the last valid artifact

## 12. Error, Retry, Repair, And Artifact-Preservation Rules

- Preflight blocked:
  - persist a blocked canonical manifest outcome
  - do not call the provider
  - preserve any prior valid canonical artifact
- Initial validation failure:
  - run the canonical full repair route using the existing full repair variant and validator model settings
- Repair failure:
  - persist failed raw response/debug artifacts and issue list
  - do not overwrite the last valid canonical artifact
- Transport/API failure:
  - preserve debug request/error payloads
  - record failure in canonical manifest
- Batch import schema/content failure:
  - mark the item `schema-invalid` or `content-invalid`
  - preserve downloaded raw output JSONL and the last valid canonical artifact
- No short-route leakage:
  - canonical English full may never enter:
    - short response schemas
    - short repair instructions
    - short token budgets
    - short persistence files

## 13. Observability And Security Requirements

- Log and persist:
  - canonical artifact status
  - request label
  - prompt/schema fingerprints
  - preflight fingerprint
  - repair attempts
  - input/output tokens
  - estimated cost
- Keep debug artifacts under the existing per-episode debug directory.
- Do not persist API keys, auth headers, or full runtime config dumps.
- Preserve existing source/debug artifacts that are useful for forensic review.
- Manifest/log fields must be sufficient to explain why localized full or short artifacts were invalidated after a canonical English full change.

## 14. Cost And Performance Safeguards

- Always reuse Task 06 preflight and duplicate-failed-request detection.
- Use canonical manifest resume checks before provider invocation.
- Avoid reparsing compatibility markdown on the hot path when a valid canonical artifact exists.
- Do not run localized full generation or short generation when canonical English full is blocked or invalid.
- Keep French support operational, but do not expand work beyond current locale set.
- Preserve existing narrow debug writes; do not add unbounded prompt duplication outside current debug/artifact folders.

## 15. Test Strategy

### Unit

- canonical full artifact schema round-trip
- manifest lineage fingerprint generation
- resume eligibility and stale rejection
- validator blocks missing climax or ending
- narration-only response schema remains free of short/metadata fields
- preflight persistence for `canonical-english-full`

### Integration

- `localizeStoryEpisode()` in full-only mode writes:
  - canonical JSON
  - canonical manifest
  - `en/full/script.md`
  - root compatibility `script.md`
- resume skips valid canonical English full and generates only newly requested downstream outputs
- canonical English full change invalidates localized full cache and short cache
- failed repair preserves prior valid canonical artifact

### Batch integration

- prepare canonical-English-full item with compiler/schema fingerprints
- import canonical-English-full narration-only result into canonical files
- legacy narration-only and legacy mixed batch results remain readable
- retry uses new canonical fingerprint when prompt/schema lineage changes

### CLI

- `stories rewrite-full` still builds a full-only config and reports canonical artifact paths
- existing command registration and flag behavior remain unchanged

## 16. Ordered Implementation Phases

1. Add canonical full artifact and manifest schemas/types, plus path helpers.
2. Add canonical full persistence/resume module with atomic writes and compatibility projection.
3. Rewire sync `localizeStoryEpisode()` English full stage to persist canonical artifacts and use them for resume/downstream parentage.
4. Rewire downstream localized full consumers in the same service to read canonical manifest/artifact fingerprints instead of reparsed compatibility markdown state.
5. Add canonical-English-full batch item preparation/import/retry support.
6. Add invalidation and stale-parent checks for localized full and short compatibility consumers.
7. Add focused unit, integration, batch, and CLI coverage.

## 17. Acceptance Criteria

- Task title confirmed: **Canonical English Full Generation**.
- `stories rewrite-full` still works from the same public command surface.
- Canonical English full is written as a first-class artifact with lineage, validation, repair, usage, and status metadata.
- Full generation uses only:
  - cleaned English source
  - StoryIR
  - full-story contract
  - Task 05 compiler
  - Task 06 preflight
- Full provider output is narration-only and never requests short/metadata/audio/image/render/publication content.
- Canonical English full never routes through short schemas, short budgets, or short repair semantics.
- Resume rejects stale canonical full and stale downstream artifacts using canonical manifest lineage.
- Localized full and short downstream work depend on validated canonical English full only.
- Legacy outputs/manifests remain compatibility-readable; new writes use the canonical Task 07 format.

## 18. Risks, Deferrals To Task 08+, And Open Questions

### Risks

- The existing `localizeStoryEpisode()` service is oversized; a shallow edit there will likely re-entangle full, localized, and short logic.
- Path migration to `en/full` touches compatibility assumptions in tests and downstream tools.
- Batch migration is easy to under-specify because current batch mode never creates canonical-English-full items.

### Deferrals to Task 08+

- locale-specific localized full lineage enforcement beyond canonical parent identity
- richer locale validation and parent-locale compatibility rules
- broader downstream invalidation/reporting across metadata/audio/visual stages

### Open questions

- Should the canonical English full human-readable markdown under `en/full/script.md` remain the same compatibility shape as root `script.md`, or should it be a slimmer canonical projection with root `script.md` carrying the richer legacy formatting? Current code suggests keeping them identical initially is lower risk.
- Should `stories localize` batch preparation create canonical-English-full items only when no valid canonical manifest exists, or always model them explicitly and mark them `skipped-cached`? Existing batch manifest semantics point toward explicit items with `skipped-cached` status.
- Does any downstream non-test code read root `script.md` as the sole English full path and ignore `en/full` entirely today? The safe assumption is yes; Task 07 should keep root `script.md` as a compatibility projection until Task 16/18 can finish broader migration cleanup.

### Defaults chosen for this plan

- Plan filename:
  `docs/plans/07-canonical-english-full-generation-plan.md`
- Canonical new-write English full directory:
  `<episode>/en/full/`
- Root `<episode>/script.md` remains compatibility-write and compatibility-read during Task 07.
- French stays supported as a compatibility locale and must not regress during Task 07.
