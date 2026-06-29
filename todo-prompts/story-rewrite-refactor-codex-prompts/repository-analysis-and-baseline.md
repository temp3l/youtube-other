# Repository Analysis And Baseline

## Scope

This report documents the current repository behavior for story rewrite/localization as implemented in source, not the intended refactor. It covers task 01 only. No production refactor, prompt rewrite, interface change, artifact migration, or paid API execution was performed.

Primary inspected sources:

- `apps/cli/src/index.ts`
- `apps/cli/src/story-localization-commands.ts`
- `apps/cli/src/story-full-rewrite-command.ts`
- `apps/cli/src/story-short-rewrite-command.ts`
- `apps/cli/src/episode-commands.ts`
- `packages/story-localization/src/*`
- `packages/config/src/index.ts`
- `packages/shared/src/episode-filesystem.ts`
- `packages/scene-planning/src/index.ts`
- `packages/image-generation/src/index.ts`
- `packages/metadata/src/index.ts`
- `packages/metadata/src/youtube-metadata.ts`
- `packages/youtube-upload/src/index.ts`

## Locale And Language Baseline

Current source-level language set:

- `packages/story-localization/src/story-localization.types.ts` exports `languageCodes = ["en", "de", "es", "fr", "pt"]`.
- `packages/shared/src/episode-filesystem.ts` exports `localeCodes = ["en", "de", "es", "fr", "pt"]`.
- `apps/cli/src/story-short-rewrite-command.ts` accepts `en`, `de`, `es`, `fr`, `pt`.
- `apps/cli/src/story-localization-commands.ts` default localization targets are `de`, `es`, `fr`, `pt`.

Exact locale variants used by current rewrite/localization code:

- `en` -> `en-US` in `packages/story-localization/src/language-profiles.ts`
- `de` -> `de-DE`
- `es` -> `es-419`
- `fr` -> `fr-FR`
- `pt` -> `pt-BR`

Portuguese status:

- Story rewrite/localization code treats Portuguese as primary language code `pt`.
- Locale-specific guidance and short rewrite constants both use Brazilian Portuguese (`pt-BR`).
- `packages/shared/src/episode-filesystem.ts` normalizes locale codes to primary language keys, so `pt-BR` resolves to workspace locale `pt`.

French status:

- `fr/full` and `fr/short` remain supported in story-localization and short-rewrite code.
- `apps/cli/src/story-localization-commands.ts` still defaults to including French.
- `packages/story-localization/src/story-localization.service.ts` still counts generated French full/short outputs.
- Downstream YouTube channel config has German, Spanish, and French overrides, but no Portuguese-specific override fields.

## Story-Producing Commands

Commands that can currently produce the listed artifacts:

| Artifact | Commands that can produce it | Notes |
|---|---|---|
| `en/full` | `stories rewrite-full`, `stories localize`, legacy `episode english` | `stories rewrite-full` materializes canonical source then writes `<episode>/script.md`. `stories localize` also produces English full before localized outputs. |
| `en/short` | `stories rewrite-short --language en`, `stories localize` with `--include-english-short` defaulting to true, legacy `episode short` | `rewrite-short` requires a generated full story unless `--compatibility-source` is used. |
| `de/full` | `stories rewrite-full --language de`, `stories localize`, legacy `episode localized --languages de` | Written under `<episode>/de/full/script.md` in rewrite-full path and under localized outputs in localization path. |
| `de/short` | `stories rewrite-short --language de`, `stories localize`, legacy `episode short --language de` | In `stories localize`, the localized short may come from combined full+short provider output. |
| `es/full` | `stories rewrite-full --language es`, `stories localize`, legacy `episode localized --languages es` | Same structure as German. |
| `es/short` | `stories rewrite-short --language es`, `stories localize`, legacy `episode short --language es` | Same lineage split as German. |
| `pt/full` | `stories rewrite-full --language pt`, `stories localize`, legacy `episode localized --languages pt` | Supported by current story code. |
| `pt/short` | `stories rewrite-short --language pt`, `stories localize`, legacy `episode short --language pt` | Supported by current story code. |
| `fr/full` | `stories rewrite-full --language fr`, `stories localize`, legacy `episode localized --languages fr` | Still supported. |
| `fr/short` | `stories rewrite-short --language fr`, `stories localize`, legacy `episode short --language fr` | Still supported. |

Important legacy CLI mismatch:

- `apps/cli/src/episode-commands.ts` advertises `--language <en|de|es|fr>` for `episode short` and `episode plan`, but repository story code supports `pt` as well.

## Baseline Table

| Stage | Current command/function | Source artifact | Output artifact | Model/config | Validation | Cache/resume | Known defect |
|---|---|---|---|---|---|---|---|
| Canonical source discovery | `stories localize` -> `discoverCanonicalSourceStories` / `selectSourceCandidates`; `stories rewrite-full` -> `resolveFullRewriteInput`; `stories rewrite-short` -> `resolveShortRewriteInput` | Canonical English source markdown or explicit input | Resolved source path plus normalized source hash | `packages/config/src/index.ts` workspace and OpenAI env precedence | File existence, size, heading/section parsing | Deterministic path search; no provider call | `rewrite-short` and `rewrite-full` use different resolution rules and provenance requirements |
| Canonical source materialization | `materializeCanonicalSourceStory` from full/short commands and batch paths | Resolved source markdown | `<episode>/source/<episode>-source.md` | No model; filesystem only | Hash and overwrite checks | Reuses existing canonical source unless overwrite | None in this stage |
| English full rewrite | `stories rewrite-full` -> `localizeStoryEpisode`; `stories localize` -> `localizeStoryEpisode` | Canonical English source | `<episode>/script.md` | `openAiStoryModel`, `openAiStoryTemperature`, `openAiStoryReasoningEffort`, `openAiStoryMaxOutputTokens`, fallback defaults in `packages/config/src/index.ts` | Zod response schema, canonical fact validation, forbidden phrase/content checks, optional repair | `.localization-cache`, cache key includes source hash/config/prompt version/model/language; resume skips valid outputs | Prompt templates loaded from `docs/templates/audio/*.md`, but those files are missing in repo |
| English short rewrite | `stories rewrite-short --language en` -> `rewriteShortStories`; `stories localize` optional post-full call into `rewriteShortStories` | Generated English full script for strict path; raw source only with `--compatibility-source` | `<episode>/en/short/script.md` plus compatibility sidecars/manifests | `openAiShortModel` fallback chain or explicit `--model`; short max token and repair config from runtime config | Zod short schema, word-count checks, hook/thumbnail validation, editorial commentary detection, repair prompt | Manifest-driven resume in short rewrite output paths | Lineage differs from `stories localize`, which can generate shorts without going through the strict generated-full provenance gate |
| Localized full rewrite | `stories rewrite-full --languages ...` -> `localizeStoryEpisode`; `stories localize` | Canonical English full parsed after English rewrite | `<episode>/<lang>/full/script.md` | `openAiLocalizationModel` in `stories localize`; `stories rewrite-full` passes `openAiStoryModel` into localization service | Zod full schema, canonical fact validation, length checks, retry/repair hooks | `.localization-cache` per language; resume via cache plus output validation | `stories rewrite-full` and `stories localize` do not share identical model/config routing |
| Localized short rewrite | `stories rewrite-short --languages ...`; `stories localize` combined localization response path | For `rewrite-short`: generated full input. For `stories localize`: same provider response may include localized short beside localized full | `<episode>/<lang>/short/script.md` | `openAiShortModel` in short-only path; `openAiLocalizationModel` or story model in combined localization path | Same short validator in short-only path; combined path validated as part of story-localization package | Short-only path has manifest-based resume; combined path piggybacks on localization cache | Current lineage split: shorts may derive from generated full, raw source compatibility input, or combined full+short localization response |
| Batch localization | `stories localize --mode batch`; `stories:batches *` | Canonical English sources | Batch manifests, uploaded JSONL, imported localized/full/short outputs | Same story/localization model config as sync path | Batch item schema and content validation during import | `StoryBatchIndexService`, local batch manifests, refresh/import/retry commands | Same missing prompt template dependency applies at runtime |
| Metadata generation | `metadata generate`, `metadata youtube`, `youtube upload --generate-metadata` | `canonical/scenes.json` or localized scenes source | `youtube-metadata.json`, markdown/txt derivatives | `openAiMetadataModel`, validator fallback chain, `YOUTUBE_METADATA_PROMPT_VERSION` | Scene plan validation, structured response schema, metadata generation info schema | Prompt/source/model/language cache key in metadata outputs | `describeLanguage` in metadata code has explicit `de/en/es/fr`; Portuguese falls through to raw code string |
| Audio/TTS | `audio generate`, `audio generate-localized` | Episode script markdown under locale/full or locale/short paths | Narration WAV and segments | `openAiSpeechModel`, `openAiSpeechVoice`, TTS provider config | Script loading and voice settings validation | Existing output files reused by command behavior | Not inspected for refactor changes; downstream only |
| Scene planning | `episode plan`, downstream pipeline planning | Transcript + rewritten script | `scenes.json` and scene prompt structures | Runtime scene timing config from `packages/config/src/index.ts` | Domain schemas in `@mediaforge/domain` | Deterministic generation from transcript/script | No story-refactor-specific defect found here |
| Image generation | `images plan`, `images generate`, `images generate-openai`, `images resume`, `images sync-shared`, `stories resume-images` | Scene plan, prompts, shared character assets | Scene image prompts, manifests, generated images, state artifacts | Image provider config, local style template fallback | Image manifest and asset validation helpers | State and manifest directories under episode `state/image-generation` | Uses `docs/templates/visual-scene-style.md` with fallback text, so visual template missing is tolerated unlike audio prompts |
| Render | `render`, `clips generate`, `clips backfill-manifests`, `render remote *` | Localized/full scripts, audio, captions, images | Final MP4s and render manifests | Render/local/remote config in runtime config | Render validation via `validateRenderedVideo` | Existing render manifests and outputs reused | No story-refactor-specific defect found here |
| YouTube upload | `youtube upload` | Video, thumbnail, metadata, episode manifest | Upload reports in episode upload state | OAuth config from runtime config and per-language channel/token overrides | Metadata file, thumbnail/video path, channel ownership checks | Previous upload report prevents duplicate upload unless `--force` | Per-language YouTube overrides exist for `de`, `es`, `fr`, but not `pt` |

## Full-Story Call Graph

Primary rewrite-full path:

1. `apps/cli/src/index.ts` registers `registerStoryLocalizationCommands`.
2. `apps/cli/src/story-localization-commands.ts` calls `registerStoryRewriteFullCommand`.
3. `apps/cli/src/story-full-rewrite-command.ts`:
   - parses `--episode` or `--input`
   - loads runtime config via `loadRuntimeConfig`
   - resolves input with `resolveFullRewriteInput`
   - materializes canonical source with `materializeCanonicalSourceStory`
   - builds a `StoryLocalizationConfig` through `createStoryLocalizationConfig`
   - creates OpenAI client with `createOpenAiStoryClientWithOptions`
   - calls `localizeStoryEpisode`
4. `packages/story-localization/src/story-localization.service.ts`:
   - parses source with `parseCanonicalSourceStory`
   - extracts facts with `extractCanonicalStoryFacts`
   - builds production context in `story-production.ts`
   - builds prompt with `buildLocalizationPrompt`
   - loads `system-prompt.md` and `full-story-prompt.md` through `loadAudioTemplate`
   - sends provider request through `generateStructuredStoryPackage`
   - `generateStructuredStoryPackage` calls `callOpenAiStructured`
   - `callOpenAiStructured` uses `client.responses.parse` when available, otherwise `client.responses.create`
5. Result is validated, optionally repaired, rendered to markdown, cached, and written to `<episode>/script.md` and localized output paths.

Legacy/localize path:

1. `stories localize` -> `commandStoriesLocalize`.
2. Depending on flags, it calls:
   - `prepareStoryLocalizationBatch`
   - `submitStoryLocalizationBatch`
   - `localizeSelectedStories`
   - `refreshStoryLocalizationBatch`
   - `importStoryLocalizationBatch`
3. Sync mode eventually reaches `localizeStoryEpisode`; batch mode builds the same prompt family but persists batch manifests and imports results later.

## Short-Story Call Graph

Primary rewrite-short path:

1. `apps/cli/src/index.ts` registers `registerStoryLocalizationCommands`.
2. `apps/cli/src/story-localization-commands.ts` calls `registerStoryRewriteShortCommand`.
3. `apps/cli/src/story-short-rewrite-command.ts`:
   - normalizes requested languages against `SUPPORTED_STORY_LANGUAGES`
   - loads runtime config
   - selects `openAiShortModel` / `openAiStoryModel` fallback chain
   - creates OpenAI client with `createOpenAiStoryClientWithOptions`
   - calls `rewriteShortStories`
4. `packages/story-localization/src/short-rewrite.service.ts`:
   - resolves source with `resolveShortRewriteInput`
   - enforces generated-full provenance unless `allowSourceInput` / `--compatibility-source`
   - materializes canonical source
   - builds prompt with `buildShortRewritePrompt`
   - loads `system-prompt.md` and `short-story-prompt.md` through `loadAudioTemplate`
   - calls `requestStructuredShortRewrite`
   - `requestStructuredShortRewrite` uses `client.responses.parse` when available, otherwise `client.responses.create`
5. Result is validated, optionally repaired with `buildShortRewriteRepairPrompt`, written to markdown/json sidecars, and merged into per-language manifests.

Embedded short generation inside `stories localize`:

1. English short:
   - `localizeStoryEpisode` first writes English full.
   - If `includeEnglishShort` is true, it calls `rewriteShortStories` with the generated English full path.
2. Localized short:
   - If `includeLocalizedShorts` is true, `localizeStoryEpisode` requests a combined localized full+short schema and writes both from the same provider response.

## Current Short Lineage Baseline

Current short derivation paths are not unified:

- `stories rewrite-short` expects a validated generated full story and rejects non-generated inputs unless `--compatibility-source` is passed.
- `stories localize` can still generate:
  - English short from the generated English full by calling `rewriteShortStories`.
  - Localized shorts directly from a combined localized full+short response without a second short-only pass.
- Legacy `episode short` remains another command surface and should be treated as separate until audited in a later task.

Implication:

- Current repository behavior does not enforce one canonical short lineage. Shorts can derive from:
  - raw/canonical source with compatibility override;
  - validated generated English full;
  - combined localized full+short generation response.

## Prompt Builders And Runtime Template Assumptions

Prompt/template sources:

- `packages/story-localization/src/prompt-template-loader.ts`
- `packages/story-localization/src/localization-prompt-builder.ts`
- `packages/story-localization/src/short-rewrite.prompt.ts`
- `packages/story-localization/src/multilingual-story-localization-settings.ts`

Current behavior:

- Full story prompt builder loads:
  - `docs/templates/audio/system-prompt.md`
  - `docs/templates/audio/full-story-prompt.md`
- Short story prompt builder loads:
  - `docs/templates/audio/system-prompt.md`
  - `docs/templates/audio/short-story-prompt.md`
- Locale-specific instructions are inserted before a marker section in the template.

Confirmed defect:

- `docs/templates/audio/system-prompt.md` is absent.
- `docs/templates/audio/full-story-prompt.md` is absent.
- `docs/templates/audio/short-story-prompt.md` is absent.
- `loadAudioTemplate` uses `fs.readFileSync` without fallback, so runtime prompt loading fails when these files are needed.

## Schemas, Validators, Repair Logic, Retry Logic

Current locations:

- Story schemas:
  - `packages/story-localization/src/story-localization.schemas.ts`
  - `packages/story-localization/src/short-rewrite.schemas.ts`
- Story validators:
  - `packages/story-localization/src/generated-story-validator.ts`
  - inline validation closures in `story-localization.service.ts`
  - short payload analysis in `short-rewrite.service.ts`
- Repair logic:
  - `generateStructuredStoryPackage` in `story-localization.service.ts`
  - `buildShortRewriteRepairPrompt` and repair request loop in `short-rewrite.service.ts`
- Retry logic:
  - transient provider retry settings passed into OpenAI client creation
  - structured repair/retry loop in `story-localization.service.ts`
  - `isTransientOpenAiError` and retry handling in `short-rewrite.service.ts`
- Batch retry logic:
  - `retryFailedStoryBatch` in `story-localization-batch-service.ts`

## Cache, Resume, Persistence, Manifests

Full/localization persistence:

- Cache helpers live in `packages/story-localization/src/story-localization-cache.ts`.
- Cache directories:
  - global: `<output>/.localization-cache`
  - episode: `<output>/<episode>/.localization-cache`
- Cache entry key material includes:
  - source hash
  - configuration hash
  - prompt version
  - model
  - language
- Facts cache stores canonical facts separately by source hash.

Short rewrite persistence:

- Resolution helpers: `short-rewrite.resolution.ts`
- Output path helpers and provenance checks: `short-rewrite.utils.ts`
- Manifest/file persistence: `short-rewrite.persistence.ts`
- Resume eligibility is checked in `short-rewrite.service.ts` before generation.

Batch persistence:

- `story-localization-batch-storage.ts`
- `story-localization-batch-index.ts`
- `StoryBatchIndexService`
- Batch manifests, reports, input JSONL, imported outputs, and lock files live under batch storage layout derived from output directory.

Artifact path baseline:

- English full rewrite output: `<episode>/script.md`
- Canonical source copy: `<episode>/source/<episode>-source.md`
- Localized full: `<episode>/<lang>/full/script.md`
- Localized short: `<episode>/<lang>/short/script.md`
- Canonical workspace locale layout downstream: `<episode>/locales/<lang>/<variant>/...` from `packages/shared/src/episode-filesystem.ts`

Important path mismatch to preserve:

- Story rewrite/localization writes under `<episode>/<lang>/full|short`.
- Shared episode filesystem and downstream media commands use canonical locale layout under `<episode>/locales/<lang>/<variant>/...`.
- This inconsistency is current behavior and must not be changed accidentally in later tasks.

## Model Routing And `.env` Precedence

Runtime config source order in `packages/config/src/index.ts`:

1. explicit CLI/runtime overrides passed to `loadRuntimeConfig`
2. episode overrides from `episode.config.json` when a command loads episode config
3. `.env` values from `process.cwd()/.env`
4. actual process environment
5. hardcoded defaults

Important nuance:

- `.env` is parsed first, then overridden by `process.env`.
- Some story commands call `loadRuntimeConfig()` directly without episode overrides.
- Other CLI flows load episode config first through `loadPipeline()` and pass episode overrides into `loadRuntimeConfig`.

Story model fallback chains:

- Full rewrite command:
  - model: `options.model ?? runtimeConfig.openAiStoryModel ?? DEFAULT_STORY_REWRITE_MODEL`
- Short rewrite command:
  - model: `options.model ?? runtimeConfig.openAiShortModel ?? runtimeConfig.openAiStoryModel ?? DEFAULT_STORY_REWRITE_MODEL`
- `stories localize`:
  - model: `options.model ?? runtimeConfig.openAiLocalizationModel ?? SHORT_REWRITE_DEFAULT_MODEL`

Validator/repair fallback chains:

- repair model usually resolves as:
  - `openAiValidatorModel`
  - fallback to `openAiMetadataModel`
  - final hardcoded defaults in config

## Cost And Telemetry Baseline

Cost estimation:

- Story localization cost estimation lives in `packages/story-localization/src/story-localization.cost-tracker.ts`.
- It uses deterministic usage payloads and model pricing, returning `null` when no pricing is configured.
- Short rewrite uses `estimateTokenCostMicros` from `@mediaforge/observability`.
- Metadata generation has its own cache/generation info tracking in `packages/metadata/src/youtube-metadata.ts`.

Telemetry:

- CLI execution telemetry is initialized in `apps/cli/src/index.ts`.
- Story/localization code uses `createLogger` from `@mediaforge/observability`.
- YouTube upload records request-level telemetry in `packages/youtube-upload/src/index.ts`.

No new instrumentation was added in task 01.

## Downstream Media And Publishing Commands

Current downstream command inventory in `apps/cli/src/index.ts` and `apps/cli/src/episode-commands.ts`:

- Audio:
  - `audio generate`
  - `audio generate-localized`
- Clips:
  - `clips generate`
  - `clips backfill-manifests`
- Images:
  - `images plan`
  - `images generate`
  - `images generate-character-references`
  - `images approve-character`
  - `images regenerate-character`
  - `images export-openart`
  - `images open-openart`
  - `images import`
  - `images status`
  - `images validate`
  - `images missing`
  - `images reject`
  - `images regenerate-workbook`
  - `images assign`
  - `images generate-openai`
  - `images resume`
  - `images sync-shared`
  - `stories resume-images`
- Render:
  - `render`
  - `render remote check`
  - `render remote cleanup`
  - `render remote test`
- Metadata:
  - `metadata generate`
  - `metadata youtube`
- YouTube:
  - `youtube upload`
- Legacy episode flow:
  - `episode english`
  - `episode localized`
  - `episode short`
  - `episode status`
  - `episode validate`
  - `episode bootstrap-characters`
  - `episode sync-characters`
  - `episode resume-images`

Downstream package entry points:

- Scene planning: `packages/scene-planning/src/index.ts`
- Image generation/state: `packages/image-generation/src/index.ts`
- Metadata and YouTube metadata generation: `packages/metadata/src/index.ts`, `packages/metadata/src/youtube-metadata.ts`
- Upload: `packages/youtube-upload/src/index.ts`

## Downstream Locale Baseline

Metadata:

- `readAndValidateScenesFile` writes localized metadata outputs under `<episode>/locales/<language>/full/metadata`.
- `describeLanguage` in metadata code has explicit English/German/Spanish/French labels and falls back to raw input for Portuguese.

YouTube upload:

- Upload path selection normalizes locale using `normalizeLocaleCode`.
- Localized metadata candidates are scanned from `<episode>/locales/*/...`.
- Channel and refresh-token overrides exist for:
  - German
  - Spanish
  - French
- No Portuguese-specific `youtubeChannelId` or `youtubeRefreshToken` override fields exist in current runtime config.

## Repository Findings That Later Tasks Must Preserve

- Preserve current CLI command names and options:
  - `stories localize`
  - `stories rewrite-full`
  - `stories rewrite-short`
  - `stories:batches *`
  - legacy `episode english`, `episode localized`, `episode short`
- Preserve current artifact paths and mixed path conventions until migration is explicitly implemented.
- Preserve current resume/cache semantics:
  - full/localization cache entries in `.localization-cache`
  - short manifest-based resume and overwrite behavior
  - upload duplicate protection via previous report matching
- Preserve `.env` and runtime config precedence from `loadRuntimeConfig`.

## Confirmed Defects And Risks

Confirmed defects:

- Runtime prompt template files for story rewrite/localization are missing:
  - `docs/templates/audio/system-prompt.md`
  - `docs/templates/audio/full-story-prompt.md`
  - `docs/templates/audio/short-story-prompt.md`
- Short lineage is inconsistent across command surfaces.
- CLI option text in legacy `episode` commands still omits `pt` in some help strings.
- Portuguese is supported in story generation, but downstream YouTube channel/token overrides have no Portuguese-specific config fields.

Repository risks for later refactor tasks:

- Story outputs and downstream media paths are not yet unified.
- Batch and sync localization share core services but persist different state shapes and failure modes.
- Full rewrite, short rewrite, and localize commands do not route models/config identically.
- Existing debug artifacts in episode outputs may look authoritative, but source templates are not present in repo.

## Recommended Next Task

Task 02 should establish the StoryIR and artifact variant model before any production prompt/compiler work. Current code mixes:

- canonical source,
- generated English full,
- localized full,
- localized short,
- cache manifests,
- and downstream locale workspace paths

without one explicit repository-wide artifact model. The StoryIR task should define those artifacts and lineages before later phases touch validation, repair, or downstream media stages.
