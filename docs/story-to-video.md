# Story-to-Video Pipeline

## 1. Purpose

This repository implements a real, split pipeline for turning episode-story markdown into reviewable and publishable video assets. The implemented path is not one single orchestrator. It is a handoff across:

- story rewriting and validation commands under [`stories`](../apps/cli/src/story-localization-commands.ts)
- media preparation commands under [`episode`](../apps/cli/src/episode-commands.ts)
- reusable media utilities under the main CLI in [`apps/cli/src/index.ts`](../apps/cli/src/index.ts)

The code currently supports:

- full 16:9 episode outputs
- short 9:16 outputs
- English canonical full stories
- localized full stories in `de`, `es`, `fr`, and `pt` on the story side
- localized media commands in practice for `en`, `de`, `es`, and `fr` on the dark-truth side
- YouTube metadata generation and YouTube upload

TikTok-style metadata is implemented heuristically in [`packages/metadata/src/index.ts`](../packages/metadata/src/index.ts), but no TikTok publishing command exists.

## 2. End-to-End Summary

1. Discover source stories either from canonical English markdown files (`stories` workflow) or from multilingual source-pack episode folders (`episode` workflow).
2. Parse source markdown into structured narration, metadata, and audio instructions.
3. Clean source text and persist canonical snapshots plus cleaning reports.
4. Extract canonical facts and derive a story IR / contract context for rewriting.
5. Generate canonical English full narration, validate it, and persist lineage and manifests.
6. Generate localized full scripts and short scripts, validate them, and cache successful outputs.
7. Run production-readiness analysis on persisted full scripts and assign `READY`, `READY_WITH_MINOR_EDITS`, `REVISION_REQUIRED`, `REWRITE_REQUIRED`, or `BLOCKED`.
8. Build speech plans, subtitle sidecars, and narration artifacts for the selected language and format.
9. Generate narration audio, retime scene plans to real audio duration, and slice per-scene audio clips.
10. Create or reuse landscape images for full video scenes, then derive portrait assets for shorts or regenerate key 9:16 scenes.
11. Render scene clips and concatenate them into final clean videos, optionally with burned captions in the generic render path.
12. Generate thumbnails, YouTube metadata, review packages, and upload reports.
13. Upload finished videos to YouTube when credentials and assets are present.

## 3. Entry Points

### Story rewrite and validation CLI

- `mediaforge stories localize`
  - Entry: [`apps/cli/src/story-localization-commands.ts`](../apps/cli/src/story-localization-commands.ts)
  - Handler: `commandStoriesLocalize`
  - Service: [`packages/story-localization/src/story-localization.service.ts`](../packages/story-localization/src/story-localization.service.ts)
- `mediaforge stories rewrite-full`
  - Entry: [`apps/cli/src/story-full-rewrite-command.ts`](../apps/cli/src/story-full-rewrite-command.ts)
  - Service: `localizeStoryEpisode`
- `mediaforge stories rewrite-short`
  - Entry: [`apps/cli/src/story-short-rewrite-command.ts`](../apps/cli/src/story-short-rewrite-command.ts)
  - Service: `rewriteShortStories`
- `mediaforge stories analyze|inspect|status`
  - Entry: [`apps/cli/src/story-analysis-command.ts`](../apps/cli/src/story-analysis-command.ts)
  - Service: `analyzeStoryProduction`, `resolveStoryProductionAnalysisStatus`

### Media preparation CLI

- `mediaforge episode english`
- `mediaforge episode localized`
- `mediaforge episode short`
- `mediaforge episode status`
- `mediaforge episode review ...`
  - Entry: [`apps/cli/src/episode-commands.ts`](../apps/cli/src/episode-commands.ts)
  - Core helper: `prepareEpisodeLanguage`

### Generic media utilities

- `mediaforge audio generate`
- `mediaforge audio generate-localized`
- `mediaforge images ...`
- `mediaforge render`
- `mediaforge metadata youtube`
- `mediaforge youtube upload`
  - Entry: [`apps/cli/src/index.ts`](../apps/cli/src/index.ts)

### Programmatic services

- story localization: [`packages/story-localization/src/story-localization.service.ts`](../packages/story-localization/src/story-localization.service.ts)
- short rewrite: [`packages/story-localization/src/short-rewrite.service.ts`](../packages/story-localization/src/short-rewrite.service.ts)
- production analysis: [`packages/story-localization/src/story-production-analysis.service.ts`](../packages/story-localization/src/story-production-analysis.service.ts)
- episode parsing/audio/scene/render helpers: [`packages/dark-truth/src/index.ts`](../packages/dark-truth/src/index.ts)
- images: [`packages/image-generation/src/index.ts`](../packages/image-generation/src/index.ts), [`packages/image-generation/src/episode-image-pipeline.ts`](../packages/image-generation/src/episode-image-pipeline.ts), [`packages/image-generation/src/shorts-image-strategy.ts`](../packages/image-generation/src/shorts-image-strategy.ts)
- rendering: [`packages/rendering/src/index.ts`](../packages/rendering/src/index.ts)
- metadata: [`packages/metadata/src/youtube-metadata.ts`](../packages/metadata/src/youtube-metadata.ts)
- publishing: [`packages/youtube-upload/src/index.ts`](../packages/youtube-upload/src/index.ts)

## 4. Full Workflow

### Stage 1: Source story discovery

- Purpose: find candidate story inputs.
- Trigger:
  - `stories localize` / `stories rewrite-full` use [`discoverCanonicalSourceStories`](../packages/story-localization/src/source-story-discovery.ts).
  - `episode inspect|english|localized|short` use [`discoverEpisodeSources`](../packages/dark-truth/src/index.ts#L1741).
- Inputs:
  - canonical search root defaults to `content/dark-truth-episodes-multilingual-production-pack`
  - episode-pack search root defaults to `content-ideas/content/dark-truth-episodes-multilingual-production-pack`
- Outputs:
  - canonical candidates shaped as `NNN-slug-en-full.md`
  - episode-pack candidates shaped as `<slug>/<lang>/<slug>-<lang>-<full|short>.md`
- Persisted artifacts: none
- Validation:
  - canonical filename regex in [`source-story-discovery.ts`](../packages/story-localization/src/source-story-discovery.ts)
  - episode candidate deduplication and `present|missing|duplicate` status in [`discoverEpisodeSources`](../packages/dark-truth/src/index.ts#L1741)
- Errors:
  - `StorySourceDiscoveryError`
  - missing source directories yield empty/missing discovery results
- Retries: none
- Cache and resume: none
- Downstream consumers: source parsing

### Stage 2: Source loading and parsing

- Purpose: load markdown and extract title, narration, metadata, and audio instructions.
- Trigger:
  - `parseCanonicalSourceStory` for canonical rewrite input
  - `parseEpisodeSourceFile` for media-generation input
- Implementation:
  - [`packages/story-localization/src/source-story-parser.ts`](../packages/story-localization/src/source-story-parser.ts)
  - [`packages/dark-truth/src/index.ts#L1814`](../packages/dark-truth/src/index.ts#L1814)
- Inputs: source markdown file
- Outputs:
  - `ParsedSourceStory`
  - `ParsedEpisodeSource`
- Persisted artifacts:
  - media path later writes `analysis.json`, `metadata.json`, `production-instructions.json`, `speech-plan.json`
- Validation:
  - required headings
  - strict metadata schemas
  - derived language and artifact type detection
- Errors:
  - malformed title heading
  - missing narration section
  - missing required localized markers
- Retries: none
- Cache and resume: none
- Downstream consumers: source cleaning, fact extraction, speech planning, rewriting

### Stage 3: Source cleanup and normalization

- Purpose: normalize line endings/whitespace and remove production contamination from rewrite inputs.
- Trigger:
  - `stories rewrite-full`
  - `stories rewrite-short`
  - internal materialization helpers
- Implementation:
  - cleaner: [`packages/story-localization/src/source-cleaning.ts`](../packages/story-localization/src/source-cleaning.ts)
  - persistence: [`packages/story-localization/src/source-cleaning-persistence.ts`](../packages/story-localization/src/source-cleaning-persistence.ts)
- Inputs:
  - raw source text
  - `sourceRole`
  - `resolvedFrom`
- Outputs:
  - cleaned source text
  - deterministic cleaning report
- Persisted artifacts:
  - `source/source-original.md`
  - `source/source-cleaned.md`
  - `source/source-cleaning-report.json`
  - short-source variants: `original-short-story.md`, `cleaned-short-story.md`, `short-story-cleaning-report.json`
- Validation:
  - fatal conditions such as `EMPTY_SOURCE`, `EMPTY_CLEANED_SOURCE`, `ONLY_REMOVABLE_CONTAMINATION`
  - report schema versioned as `source-cleaning-report-v1`
- Errors:
  - `ExistingArtifactError` when changed files exist without overwrite
  - `StoryInputNotFoundError` on fatal cleaning results or changed source hash
- Retries: none
- Cache and resume:
  - skips unchanged original/report/text writes
- Invalidation:
  - input text change
  - overwrite flag
- Downstream consumers: fact extraction, contract building, canonical rewrite

### Stage 4: Fact extraction and story IR context

- Purpose: derive canonical facts, characters, threat, setting, and a rewrite contract context.
- Trigger: full rewrite and short rewrite services.
- Implementation:
  - facts: [`packages/story-localization/src/canonical-facts.service.ts`](../packages/story-localization/src/canonical-facts.service.ts)
  - story artifact/IR adapters: [`packages/story-localization/src/story-artifact-model.ts`](../packages/story-localization/src/story-artifact-model.ts)
  - full contract: [`packages/story-localization/src/full-story-contract.ts`](../packages/story-localization/src/full-story-contract.ts)
- Inputs: parsed canonical source story
- Outputs:
  - `CanonicalStoryFacts`
  - story IR hashes
  - contract hash and build fingerprint
- Persisted artifacts:
  - facts cache under `.localization-cache/facts/<sourceHash>.json`
  - story production helper artifacts under the episode cache directory
- Validation:
  - fact extraction is heuristic, then later enforced by validators and contracts
- Errors: none at extraction time beyond parse failures
- Retries: none
- Cache and resume:
  - facts cache via [`readCanonicalFactsCache` / `writeCanonicalFactsCache`](../packages/story-localization/src/story-localization-cache.ts)
- Invalidation:
  - source hash change
- Downstream consumers: prompt compilation, localization, short adaptation

### Stage 5: Prompt compilation and preflight

- Purpose: compile prompt modules and block requests that exceed token policy limits.
- Trigger: canonical full, localized full, and short generation.
- Implementation:
  - prompt compiler: [`packages/story-localization/src/story-prompt-compiler.ts`](../packages/story-localization/src/story-prompt-compiler.ts)
  - module registry: [`packages/story-localization/src/story-prompt-module-registry.ts`](../packages/story-localization/src/story-prompt-module-registry.ts)
  - preflight: [`packages/story-localization/src/story-generation-preflight.ts`](../packages/story-localization/src/story-generation-preflight.ts)
- Inputs:
  - cleaned source
  - facts
  - story IR / contract
  - runtime model and token settings
- Outputs:
  - prompt text
  - prompt fingerprint
  - preflight artifact with `allowed|blocked`
- Persisted artifacts:
  - canonical artifact embeds prompt + preflight
  - preflight directories under episode cache
- Validation:
  - context window math
  - requested output token caps
- Errors:
  - blocked preflight becomes terminal for that generation attempt
- Retries: none
- Cache and resume:
  - request fingerprints reused across retries and manifests
- Downstream consumers: OpenAI rewrite requests

### Stage 6: Canonical English full-story generation

- Purpose: produce the canonical persisted English full script used as the root lineage for downstream localization and analysis.
- Trigger: `stories rewrite-full`, `stories localize`, or episode workflows after rewritten English exists.
- Implementation:
  - [`packages/story-localization/src/story-localization.service.ts`](../packages/story-localization/src/story-localization.service.ts)
  - persistence: [`packages/story-localization/src/canonical-full-story.persistence.ts`](../packages/story-localization/src/canonical-full-story.persistence.ts)
- Inputs:
  - cleaned canonical source
  - facts, contract, prompt, preflight
  - OpenAI client
- Outputs:
  - narration-only full rewrite response
  - canonical markdown and compatibility markdown
- Persisted artifacts:
  - `en/full/canonical-full.json`
  - `en/full/script.md`
  - episode-root compatibility `script.md`
  - `manifests/en-full.json`
  - `current-artifact.json`
  - optional debug prompt/request/response files under `debug/`
- Validation:
  - response schema in [`story-prompt-response-schemas.ts`](../packages/story-localization/src/story-prompt-response-schemas.ts)
  - semantic validation in [`generated-story-validator.ts`](../packages/story-localization/src/generated-story-validator.ts)
- Errors:
  - schema errors
  - validation failures
  - blocked preflight
  - provider failures
- Retries:
  - repair and regeneration routing via [`story-retry-routing.ts`](../packages/story-localization/src/story-retry-routing.ts)
- Cache and resume:
  - cache entries under `.localization-cache/entries`
  - resume status via `resolveCanonicalEnglishFullResume`
- Invalidation:
  - source hash
  - contract hash
  - prompt fingerprint
  - model config
- Downstream consumers:
  - localized full generation
  - short rewrite
  - production analysis
  - episode media workflows

### Stage 7: Localized full-story generation

- Purpose: generate localized full scripts from the canonical English full artifact.
- Trigger:
  - `stories localize`
  - `stories rewrite-full --languages ...`
  - `episode localized` only consumes already-materialized localized source files; it does not call the LLM itself
- Implementation:
  - service: [`packages/story-localization/src/story-localization.service.ts`](../packages/story-localization/src/story-localization.service.ts)
  - batch mode: [`packages/story-localization/src/story-localization-batch-service.ts`](../packages/story-localization/src/story-localization-batch-service.ts)
  - prompt builder: [`packages/story-localization/src/localization-prompt-builder.ts`](../packages/story-localization/src/localization-prompt-builder.ts)
- Inputs:
  - canonical English full lineage
  - target language profile
  - localization config
- Outputs:
  - localized `script.md`
  - lineage JSON result files in the episode story-production directory
- Persisted artifacts:
  - `<lang>/full/script.md`
  - cache entries in `<episode>/.localization-cache/entries/*.json`
  - batch manifests under `.batch/`
- Validation:
  - full narration validation
  - written-message preservation
  - forbidden phrase detection
  - generic filler detection
- Errors:
  - validation failure
  - missing canonical lineage
  - batch import failures
- Retries:
  - sync mode retries transient provider failures
  - batch mode supports refresh/import/retry-failed/cancel via `stories:batches`
- Cache and resume:
  - source hash + config hash + prompt fingerprint cache key
  - batch index statuses in [`StoryBatchIndexService`](../packages/story-localization/src/story-localization-batch-index.ts)
- Invalidation:
  - canonical fingerprint change
  - model/prompt/schema/config change
- Downstream consumers:
  - story analysis on localized scripts
  - localized audio generation
  - localized metadata generation
  - `episode localized`

### Stage 8: Short adaptation and short-script generation

- Purpose: derive short-form scripts from canonical or localized full-story lineage.
- Trigger:
  - `stories rewrite-short`
  - `stories localize --include-english-short`
  - `episode short` consumes existing short source markdown; it does not generate short copy itself
- Implementation:
  - service: [`packages/story-localization/src/short-rewrite.service.ts`](../packages/story-localization/src/short-rewrite.service.ts)
  - adaptation contract: [`packages/story-localization/src/short-adaptation-contract.ts`](../packages/story-localization/src/short-adaptation-contract.ts)
  - prompt builder: [`packages/story-localization/src/short-rewrite.prompt.ts`](../packages/story-localization/src/short-rewrite.prompt.ts)
  - persistence: [`packages/story-localization/src/short-rewrite.persistence.ts`](../packages/story-localization/src/short-rewrite.persistence.ts)
- Inputs:
  - canonical full lineage or explicit input
  - target duration settings
  - target WPM
- Outputs:
  - short narration markdown
  - per-language manifests and JSON sidecars
- Persisted artifacts:
  - `<lang>/short/script.md`
  - short artifact JSON, manifest JSON, source extraction JSON
  - short cleaning sidecars for compatibility input
- Validation:
  - word-range checks
  - first-sentence matching
  - editorial-commentary detection
  - duration estimation
  - schema validation
- Errors:
  - `ShortRewriteValidationError`
  - unsupported source language
  - ambiguous input
- Retries:
  - targeted repair and full short regeneration routes
- Cache and resume:
  - short cache keys use source hash, parent lineage, timing settings, prompt and model
- Invalidation:
  - target timing changes
  - parent fingerprint changes
  - prompt/model changes
- Downstream consumers:
  - short media preparation
  - audio generation for vertical assets

### Stage 9: Full-story validation

- Purpose: validate generated full narration artifacts before they are treated as canonical/current.
- Trigger: inside full rewrite service.
- Implementation: [`packages/story-localization/src/generated-story-validator.ts`](../packages/story-localization/src/generated-story-validator.ts)
- Validation includes:
  - schema conformance
  - contract preservation
  - written-message preservation
  - generic filler checks
  - forbidden phrases
- Persisted artifacts:
  - validation fields inside `canonical-full.json`
  - localized lineage artifacts record validation issues
- Downstream consumers:
  - manifest current-artifact writes
  - production analysis
  - localized generation and media prep

### Stage 10: Production-readiness analysis and gate assignment

- Purpose: score persisted full scripts for release readiness and assign one of five statuses.
- Trigger:
  - `stories analyze`
  - `stories inspect`
  - `stories status`
  - `episode status` also reads this status
- Implementation:
  - rules and schema: [`packages/story-localization/src/story-production-analysis.ts`](../packages/story-localization/src/story-production-analysis.ts)
  - persistence: [`packages/story-localization/src/story-production-analysis.persistence.ts`](../packages/story-localization/src/story-production-analysis.persistence.ts)
  - service: [`packages/story-localization/src/story-production-analysis.service.ts`](../packages/story-localization/src/story-production-analysis.service.ts)
- Inputs:
  - persisted `script.md`
  - canonical lineage / localized lineage fingerprints
  - model and reasoning settings
- Outputs:
  - `story-production-analysis.json`
  - human-readable report
- Persisted artifacts:
  - `<lang>/full/story-production-analysis.json`
- Validation:
  - score thresholds
  - deterministic weighted overall score
  - gate checks for contradictions, timeline issues, publishing block, provenance block, localized plot drift, lineage freshness, fingerprint match, structured analysis validity
- Errors:
  - missing lineage
  - stale lineage
  - invalid structured analysis
- Retries:
  - none in this service beyond a forced rerun
- Cache and resume:
  - current analysis is reused when fingerprint and lineage still match
- Invalidation:
  - script change
  - lineage change
  - model or reasoning change
- Downstream consumers:
  - `stories status`
  - `episode status`
  - manual review and release decision making

### Stage 11: Review approval gate

- Purpose: prevent localized full and short media workflows from proceeding without human approval of the current upstream artifact.
- Trigger:
  - enforced by `episode localized` and `episode short`
  - recorded by `episode review approve|reject`
- Implementation: [`apps/cli/src/episode-commands.ts`](../apps/cli/src/episode-commands.ts)
- Inputs:
  - generation manifest hash
  - reviewer name, notes, optional rejection reason
- Outputs:
  - `approval.json`
- Persisted artifacts:
  - `reviews/<lang>/<variant>/approval.json`
  - review checklist and regeneration instructions
- Validation:
  - approval must match current `generation-manifest.json` SHA256
- Errors:
  - missing approval
  - stale approval
- Retries: manual only
- Downstream consumers:
  - localized full media generation
  - short media generation

### Stage 12: Narration preparation

- Purpose: convert parsed narration into speech segments, subtitles, and supporting audio instructions.
- Trigger:
  - `buildEpisodeLoadResult`
  - `audio generate`
  - `episode english|localized|short`
- Implementation:
  - parsing and speech planning: [`packages/dark-truth/src/index.ts`](../packages/dark-truth/src/index.ts)
  - localized audio path: [`apps/cli/src/index.ts#L1774`](../apps/cli/src/index.ts#L1774)
- Inputs:
  - parsed story text
  - voice profile template
  - language / artifact type
- Outputs:
  - speech plan
  - subtitle timeline
  - audio instruction artifact
- Persisted artifacts:
  - `analysis.json`
  - `narration.txt`
  - `speech-plan.json`
  - `pronunciation-guide.json`
  - `sound-cues.json`
  - subtitle sidecars in `subtitles/`
  - `audio/audio-instructions.json` in localized CLI path
- Validation:
  - speech plan must preserve narration exactly
  - subtitle sidecars are written even before real audio is generated
- Downstream consumers: TTS, subtitle generation, metadata, review packages

### Stage 13: TTS request preparation and TTS generation

- Purpose: synthesize narration audio for full or localized scripts.
- Trigger:
  - `episode english|localized|short`
  - `audio generate`
  - `audio generate-localized`
- Implementation:
  - dark-truth path: [`generateNarrationAudio`](../packages/dark-truth/src/index.ts#L2266), [`generateMockNarrationAudio`](../packages/dark-truth/src/index.ts#L2152)
  - generic speech provider: [`packages/speech/src/index.ts`](../packages/speech/src/index.ts)
- Inputs:
  - speech plan segments
  - speech voice settings
  - model/voice/speed config
- Outputs:
  - per-segment WAV files
  - concatenated `narration.wav`
  - narration manifest
  - localized chunk prompts and generation logs in the generic CLI path
- Persisted artifacts:
  - `audio/segments-speech/*.wav`
  - `audio/narration.wav`
  - `audio/narration-manifest.json`
  - generic localized path additionally writes `audio/prompts/*.json`, `tts-generation.json`
- Validation:
  - audio payload validation in speech provider
  - narration manifest cache check by speech-plan hash and voice-profile hash
- Errors:
  - dark-truth path requires `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true`
  - generic audio path requires `ttsProvider=openai-compatible` and API key
  - provider payload validation rejects malformed or obviously bad WAV output
- Retries:
  - generic speech provider can fall back across models
  - dark-truth path reuses existing manifest when hashes match
- Cache and resume:
  - narration-manifest reuse in dark-truth
  - localized audio cleanup removes stale temp files before regeneration
- Invalidation:
  - speech plan hash
  - voice profile hash
  - narration text or config changes
- Downstream consumers:
  - scene retiming
  - scene audio slicing
  - rendering

### Stage 14: Audio validation, duration, and narration-speed checks

- Purpose: verify real narration duration and derive pacing metadata.
- Trigger:
  - `episode english|localized|short` retimes scene plan after narration generation
  - generic audio path writes duration and dependency fingerprints
- Implementation:
  - `inspectAudioDurationSeconds` in [`packages/dark-truth/src/index.ts`](../packages/dark-truth/src/index.ts)
  - speech audio payload validation in [`packages/speech/src/index.ts`](../packages/speech/src/index.ts)
- Outputs:
  - retimed scene plan
  - `qa-report.json`
- Persisted artifacts:
  - `qa-report.json`
- Validation:
  - duration must be positive
  - generic speech provider checks quiet/clipped/invalid payloads
  - `qa-report.json` stores calculated WPM and a pass flag
- Downstream consumers: retimed scenes, rendering

### Stage 15: Transcript and timing generation

- Purpose: create subtitle/timestamp artifacts for narration.
- Implemented behavior in the story workflow:
  - subtitle timing is estimated from speech segments before real audio
  - scene timing is then retimed to actual narration length after audio is written
- Implementation:
  - `buildSubtitleTimeline`, `writeSidecarSubtitles`, `retimeScenePlan` in [`packages/dark-truth/src/index.ts`](../packages/dark-truth/src/index.ts)
- Persisted artifacts:
  - `subtitles/narration.<lang>.srt`
  - `subtitles/narration.<lang>.vtt`
  - short files use `short.<lang>.srt|vtt`
- Important gap:
  - the separate `transcript generate|normalize|validate` CLI in [`apps/cli/src/index.ts`](../apps/cli/src/index.ts) belongs to the generic media pipeline and is not called by `episode english|localized|short`
  - there is no implemented speech-to-text transcript pass in the story-specific dark-truth route

### Stage 16: Scene planning and segmentation

- Purpose: split narration into balanced visual scenes and assign initial timing and visual fields.
- Trigger:
  - `episode english|localized|short`
  - generic scene utilities consume persisted `scenes.json`
- Implementation:
  - [`buildScenePlan`](../packages/dark-truth/src/index.ts#L1257)
  - [`buildLocalizedScenePlan`](../packages/dark-truth/src/index.ts#L1324)
  - `writeScenePlanArtifacts`
- Inputs:
  - narration text
  - artifact type
  - optional canonical scene count for localization
- Outputs:
  - scene plan
  - visual plan
- Persisted artifacts:
  - `shared/scenes.json` and `shared/visual-plan.json` for canonical English full
  - `<lang>/<variant>/scenes.json` and `visual-plan.json` for localized/short branches
- Validation:
  - scene schema parsing
  - scene count bounded by artifact type
- Downstream consumers:
  - image prompt creation
  - audio slicing
  - render clip generation

### Stage 17: Scene-to-audio alignment

- Purpose: align visual timing to real narration length and slice per-scene audio.
- Trigger: after narration generation in `prepareEpisodeLanguage`.
- Implementation:
  - `retimeScenePlan`
  - `sliceSceneAudioFiles`
- Inputs:
  - original scene plan
  - narration duration
  - final narration WAV
- Outputs:
  - retimed scene plan
  - `audio/segments/<scene>.wav`
- Persisted artifacts:
  - updated `scenes.json`
  - per-scene audio segments
- Validation:
  - last scene duration clamps against total narration duration
- Downstream consumers: rendering

### Stage 18: Image prompt compilation and image generation / retrieval

- Purpose: create visual prompts, generate images, or reuse existing assets.
- Trigger:
  - `episode english` generates canonical 16:9 images
  - `images plan|generate|resume`
  - `episode short` prepares portrait assets
- Implementation:
  - prompt helpers: [`packages/image-generation/src/index.ts`](../packages/image-generation/src/index.ts)
  - OpenAI generation: [`packages/image-generation/src/openai-image.ts`](../packages/image-generation/src/openai-image.ts)
  - richer scene pipeline: [`packages/image-generation/src/episode-image-pipeline.ts`](../packages/image-generation/src/episode-image-pipeline.ts)
  - shorts transformation: [`packages/image-generation/src/shorts-image-strategy.ts`](../packages/image-generation/src/shorts-image-strategy.ts)
- Inputs:
  - scene plan
  - global style and negative prompt
  - optional character registry and approved reference images
- Outputs:
  - image prompts
  - rendered images or placeholders
  - per-scene manifests/checkpoints/provider request and response logs
- Persisted artifacts:
  - `shared/images/generated/*.png`
  - `shared/image-manifest.json`
  - `state/image-generation/checkpoints/*.json`
  - `state/image-generation/manifests/*.json`
  - `state/image-generation/provider-requests/*.json`
  - `state/image-generation/provider-responses/*.json`
  - `state/image-generation/failures/*.json`
- Validation:
  - image size/output checks
  - provider response decode checks
  - `validateImageAssets`
- Retries:
  - OpenAI image retries
  - `images resume` skips known non-retryable failures and retries eligible scenes
- Cache and resume:
  - reuse based on scene/prompt similarity
  - checkpoints and per-scene manifests
- Invalidation:
  - force flag
  - prompt hash or scene hash change
- Downstream consumers: full-video render and short-video asset prep

### Stage 19: 16:9 full-video asset preparation

- Purpose: ensure a canonical landscape image exists for each scene.
- Trigger:
  - `episode english`
  - `images generate`
  - `images resume`
- Implementation:
  - `generateCanonicalImages`
  - `generateEpisodeImages`
- Behavior:
  - generates OpenAI images when paid providers are enabled
  - otherwise writes placeholders with deterministic filenames
- Naming:
  - `scene-001__000000-000004__16x9.png`
- Downstream consumers: landscape rendering and short portrait derivation

### Stage 20: 9:16 short-video asset preparation

- Purpose: build portrait scene assets from landscape inputs or regenerate key scenes.
- Trigger:
  - `episode short`
  - direct use of `prepareShortsImageAssets`
- Implementation: [`packages/image-generation/src/shorts-image-strategy.ts`](../packages/image-generation/src/shorts-image-strategy.ts)
- Implemented strategies:
  - `regenerate`
  - `smart-crop`
  - `blurred-fill`
  - motion metadata with `pan-and-scan`, though current transformation path ultimately normalizes images with `smart-crop` or blurred fill output; no video-time parallax system exists
- Selection:
  - deterministic by config
  - key scenes regenerate when `forceRegenerateAll`, selected key-scene IDs, or reuse is disabled
  - otherwise strategy defaults to `smart-crop`; if pan-and-scan is enabled, only motion metadata is attached
- Persisted artifacts:
  - `shared/short/images/generated/*.png`
  - `shared/short/images/shorts-image-manifest.json`
- Validation:
  - `auditShortsImageAssets`
- Gaps:
  - no random weighted strategy chooser
  - no implemented parallax or split-frame compositor

### Stage 21: Video render preparation, timeline construction, and rendering

- Purpose: render per-scene clips and final video outputs.
- Trigger:
  - `episode english|localized|short` via `renderCleanVideo`
  - generic `render <episode-id>` via pipeline renderer
- Implementation:
  - dark-truth wrapper: [`packages/dark-truth/src/index.ts`](../packages/dark-truth/src/index.ts)
  - renderer: [`packages/rendering/src/index.ts`](../packages/rendering/src/index.ts)
- Inputs:
  - scene plan
  - per-scene audio WAVs
  - scene images
  - optional captions
- Outputs:
  - scene clips
  - clean final mp4
  - optional captioned mp4 in generic renderer
  - render manifest
- Persisted artifacts:
  - `<lang>/<variant>/video/*.mp4` in episode workflow
  - localized audio-base `renders/<profile>/...mp4` in generic CLI path
  - `render.json`
  - scene clip manifests under clip directories
- Validation:
  - ffprobe-based output validation
  - rendered duration must not be shorter than planned scene duration
- Retries and reuse:
  - per-scene clip reuse keyed by scene/image/audio/caption/render fingerprint
  - optional remote render path exists under `render remote ...`
- Gaps:
  - dark-truth wrapper always renders without burned captions
  - transitions are clip concatenation only; no custom transitions are implemented

### Stage 22: Render validation

- Purpose: ensure final media dimensions, codecs, duration, and pixel format are acceptable.
- Trigger:
  - inside renderer
  - explicit `validateRenderedVideo` helper
- Implementation: [`packages/rendering/src/index.ts`](../packages/rendering/src/index.ts)
- Persisted artifacts:
  - validation block inside `render.json`
- Errors:
  - `MediaValidationError` on invalid output

### Stage 23: Thumbnail generation

- Purpose: generate per-episode PNG thumbnails from structured story-summary input.
- Trigger: `mediaforge thumbnails generate`
- Implementation:
  - CLI: [`apps/cli/src/thumbnail-commands.ts`](../apps/cli/src/thumbnail-commands.ts)
  - service: [`packages/image-generation/src/story-thumbnail.ts`](../packages/image-generation/src/story-thumbnail.ts)
- Inputs:
  - episode slug
  - locale
  - `full|short`
  - `hookText`
  - story summary JSON file
  - optional reference image and emphasis word
- Outputs:
  - PNG thumbnail
  - thumbnail manifest
- Persisted artifacts:
  - service uses episode-path resolution under the workspace
  - sample repo artifact: `thumbnails/thumbnail-en.png`
- Validation:
  - locale schema
  - workspace-safe reference path
  - manifest fingerprint matching
- External API:
  - OpenAI Images when not dry-run

### Stage 24: Metadata generation

- Purpose: generate YouTube metadata from scenes plus narration dependency.
- Trigger:
  - `mediaforge metadata youtube`
  - optionally as part of `youtube upload --generate-metadata`
- Implementation:
  - CLI: [`apps/cli/src/index.ts#L3442`](../apps/cli/src/index.ts#L3442)
  - service: [`packages/metadata/src/youtube-metadata.ts`](../packages/metadata/src/youtube-metadata.ts)
- Inputs:
  - scenes file
  - narration dependency fingerprint
  - prompt text from `prompts/youtube-metadata.prompt.md`
- Outputs:
  - structured metadata
  - markdown and plaintext derivatives
- Persisted artifacts:
  - `metadata/youtube-metadata.json`
  - `metadata/youtube-metadata.md`
  - `metadata/youtube-description.txt`
  - `metadata/youtube-chapters.txt`
  - `metadata/youtube-tags.txt`
  - `metadata/youtube-pinned-comment.txt`
  - `metadata/youtube-metadata-generation.json`
- Validation:
  - schema validation
  - repair pass for malformed JSON or invalid fields
  - local validation against scene count and duration
- Cache and resume:
  - cache key uses source SHA, narration fingerprint, prompt version, schema version, language, model config
- Gaps:
  - TikTok metadata exists only as heuristic library functions; no CLI producer

### Stage 25: Publish preparation and upload

- Purpose: upload an already-rendered video to YouTube with metadata and thumbnail.
- Trigger: `mediaforge youtube upload`
- Implementation:
  - CLI: [`apps/cli/src/index.ts#L3750`](../apps/cli/src/index.ts#L3750)
  - service: [`packages/youtube-upload/src/index.ts`](../packages/youtube-upload/src/index.ts)
- Inputs:
  - rendered video
  - metadata JSON or on-the-fly generated metadata
  - thumbnail path or resolved thumbnail
  - OAuth credentials and per-language refresh token/channel selection
- Outputs:
  - YouTube upload report
  - markdown summary
- Persisted artifacts:
  - `state/upload/reports/youtube-upload.json`
  - `state/upload/reports/youtube-upload.md`
  - `state/upload/thumbnails/youtube-thumbnail.jpg`
- Validation:
  - credential presence
  - metadata schema
  - thumbnail size constraints
- Retries:
  - records retryable API failures in the report
- Idempotency:
  - existing report can be reused unless `--force`
- Gaps:
  - no TikTok uploader

### Stage 26: Final persisted output and status reporting

- Purpose: expose current state for operators.
- Trigger:
  - `episode status`
  - `stories status`
  - review status commands
  - batch status commands
- Persisted summary artifacts:
  - `manifests/<lang>-<variant>.json`
  - `current-artifact.json`
  - `reviews/.../approval.json`
  - `.batch/batch-index.json`

## 5. Story Rewriting

- Cleanup is deterministic and persisted before any LLM call.
- Facts are extracted heuristically, cached, and then adapted into a story IR / contract input.
- Full-story prompt compilation is module-based; the canonical full output is narration-only JSON first, then rendered to markdown.
- Canonical English behavior is special:
  - it writes both the canonical markdown at `en/full/script.md`
  - and the compatibility root `script.md`
  - its manifest fingerprint becomes the lineage source for localized full scripts and production analysis
- Validation happens in-process before the artifact is considered current.
- Repair routing is centralized in [`story-retry-routing.ts`](../packages/story-localization/src/story-retry-routing.ts):
  - deterministic issues can block
  - scoped issues can repair
  - larger failures trigger regeneration
- Persistence:
  - canonical full: `en/full/canonical-full.json`, `en/full/script.md`, `manifests/en-full.json`
  - localized full: `<lang>/full/script.md` plus lineage-bearing cache artifacts
  - debug prompts and raw responses under `debug/` when enabled

## 6. Localization

- Supported story-localization languages: `de`, `es`, `fr`, `pt`
- Source lineage:
  - localized full scripts point back to the canonical English manifest fingerprint
  - production analysis on non-English full scripts marks lineage missing or stale when that fingerprint cannot be proven current
- Prompting:
  - localized full rewrites use `buildLocalizationPrompt`
  - language profiles come from [`language-profiles.ts`](../packages/story-localization/src/language-profiles.ts)
- Cache behavior:
  - per-episode `.localization-cache`
  - keys incorporate source hash, config hash, prompt/schema fingerprints, and parent lineage
- Output paths:
  - `<episode>/<lang>/full/script.md`
  - cache entry JSON under `.localization-cache/entries/`
- Locale validation:
  - derived from language profile locale
  - checked again when building production analysis source descriptors

## 7. Short Adaptation

- Short adaptation is an LLM rewrite service, not a simple trim.
- Inputs:
  - full-story lineage
  - short timing contract
  - per-language WPM and target duration
- Implemented steps:
  - source extraction
  - short adaptation contract creation
  - short prompt compilation
  - short narration generation
  - validation and repair/regeneration routing
- Outputs:
  - `<lang>/short/script.md`
  - manifests and sidecars from [`short-rewrite.persistence.ts`](../packages/story-localization/src/short-rewrite.persistence.ts)
- Vertical media:
  - `episode short` then uses the short markdown as the media-stage source and reuses or regenerates portrait images

## 8. Production Validation

### Readiness statuses

| Status                   | Meaning                                                          | Pipeline action                                  | Manual action                                            |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `READY`                  | All gates passed and no required changes remain                  | Processing can continue                          | Optional spot-check only                                 |
| `READY_WITH_MINOR_EDITS` | Hard gates passed; only minor cleanup remains                    | Processing can continue                          | Review wording or pacing polish                          |
| `REVISION_REQUIRED`      | Non-blocking gates failed; repairable issues remain              | Stop release decision; revise and rerun analysis | Edit or regenerate script                                |
| `REWRITE_REQUIRED`       | Core structural or production issues make the script non-viable  | Route back to rewrite                            | Rewrite canonical or localized full story                |
| `BLOCKED`                | Blocking contradiction, provenance, publishing, or lineage issue | Stop                                             | Manual intervention required before any release decision |

### Where each status comes from

- Generating component: `deriveStoryProductionVerdict` in [`story-production-analysis.ts`](../packages/story-localization/src/story-production-analysis.ts)
- Input data:
  - model response scores and findings
  - lineage freshness and fingerprint checks
  - structured-analysis validity
- Persistence location:
  - `<lang>/full/story-production-analysis.json`
- Downstream behavior:
  - `stories status` maps current analyses directly to verdicts
  - stale or missing analyses become `ANALYSIS_STALE` or `NOT_ANALYZED`
  - `episode status` embeds the raw analysis status beside human approval state

### Exact criteria

- `BLOCKED`
  - any blocking gate check fails
  - contradictions, timeline inconsistency, monetization/provenance blockers, localized plot drift, missing lineage, stale lineage, analysis fingerprint mismatch, or invalid structured analysis
- `REWRITE_REQUIRED`
  - no blocking failure, but severe structural failure, unsuitable visual production, very weak ending, or several major non-blocking gate failures
- `REVISION_REQUIRED`
  - at least one non-blocking gate failed without escalating to rewrite
- `READY`
  - all gates passed and there are no required changes or major retention risks
- `READY_WITH_MINOR_EDITS`
  - all hard gates passed, but required changes or major retention risks still exist

## 9. TTS and Audio

- Narration source:
  - dark-truth path uses parsed source narration or rewritten markdown consumed as source files
  - generic `audio generate` path uses persisted episode script markdown
- Voice selection:
  - dark-truth resolves preset and language-specific voice instructions from `config/voices/dark-truth-documentary/*.txt`
  - generic speech path uses `loadSpeechVoiceSettings`
- Provider:
  - `OpenAiCompatibleSpeechProvider` in [`packages/speech/src/index.ts`](../packages/speech/src/index.ts)
  - `MockSpeechProvider` when paid providers are not enabled in dark-truth internals
- Model:
  - configurable via `OPENAI_TTS_MODEL` / runtime config
- Request construction:
  - one request per speech segment/chunk
  - target duration derived from word count and pace WPM
- Chunking:
  - dark-truth splits into segment chunks by paragraph/sentence boundaries and max words
  - generic localized path balances script chunks to scene count
- Retries:
  - speech provider supports fallback models
  - localized CLI clears stale temp files before regeneration
- Audio format:
  - validated WAV payloads in practice
- Output path:
  - dark-truth: `<lang>/<variant>/audio/narration.wav`
  - generic localized path: `<audio-base>/audio/narration.wav`
- Duration calculation:
  - ffprobe via `inspectAudioDurationSeconds`
- Narration WPM checks:
  - stored in `qa-report.json`
- Audio fingerprinting:
  - narration manifest stores speech-plan hash, voice-profile hash, and per-segment SHA256
- Cache behavior:
  - narration reuse when manifest and hashes still match
- Failure handling:
  - malformed payloads raise provider response errors

## 10. Transcript and Timing

- The story-specific route does not transcribe generated narration back into text.
- Instead it persists:
  - estimated subtitle sidecars from speech segments
  - retimed scene timestamps based on real narration duration
- Files:
  - `subtitles/*.srt`
  - `subtitles/*.vtt`
  - `scenes.json`
- Timing corrections:
  - `retimeScenePlan` proportionally aligns scene timing to final narration duration before audio slicing

## 11. Scene Planning

- Scene extraction is deterministic from narration chunks.
- Scene IDs use `scene-001`, `scene-002`, and so on.
- Ordering is preserved by chunk order.
- Duration targets come from chunk word counts and later retiming.
- Prompt generation fields include:
  - `subject`
  - `action`
  - `setting`
  - `visualPurpose`
  - `cameraFraming`
  - `mood`
- Synchronization:
  - localized full scene plans preserve canonical scene count
  - short assets preserve short scene plan order

## 12. Image Generation

- Provider and model abstraction:
  - direct OpenAI image generation helpers
  - richer `ImageGenerator` abstraction in `episode-image-pipeline`
- Aspect ratio handling:
  - full pipeline defaults to `16:9`
  - short assets output `9:16`
- Image count:
  - one canonical image per scene
- Concurrency:
  - configurable via `OPENAI_IMAGE_CONCURRENCY`
- Retries:
  - configurable via `OPENAI_IMAGE_MAX_RETRIES`
- Filenames:
  - `scene-001__000000-000004__16x9.png`
  - portrait naming uses `__9x16`
- Persistence:
  - shared generated images
  - provider request/response sidecars
  - scene manifests and checkpoints
- Fingerprints:
  - prompt hash
  - provider request hash
  - image-plan fingerprints
- Validation:
  - decode and dimension validation
  - manifest-based asset validation
- Blocked-image behavior:
  - `images resume` skips non-retryable failures and reports categories
- Fallback logic:
  - reuse prior images when prompts/scenes are similar
  - placeholders when paid providers are disabled in canonical full generation
- Cost controls:
  - image telemetry uses pricing estimates from observability

## 13. Full-Video Asset Preparation

- Implemented behavior is simple and concrete:
  - scene images are generated or reused
  - scene audio is sliced
  - per-scene clips are rendered and concatenated
- No smart camera motion is applied in the full 16:9 path beyond what the FFmpeg clip renderer implements for still images.
- No cross-scene transition system beyond concatenation is present.

## 14. Short-Video Asset Preparation

- Implemented conversion strategies:
  - `regenerate`
  - `smart-crop`
  - `blurred-fill`
  - motion metadata for `pan-and-scan`
- Strategy selection is deterministic:
  - regenerate for key scenes or forced runs
  - otherwise prefer `smart-crop`
  - fallback to `blurred-fill` only when configured without pan-and-scan
- No random weighting.
- No implemented parallax, split framing, or multi-layer depth compositor.

## 15. Rendering

- Renderer:
  - `FFmpegVideoRenderer`
  - optional `HybridFFmpegVideoRenderer` for remote clip rendering
- Tooling: FFmpeg and ffprobe
- Timeline construction:
  - render one clip per scene
  - concat demuxer builds final video
- Frame rate: `30`
- Resolution:
  - full `1920x1080`
  - vertical `1080x1920`
- Audio mapping:
  - per-scene WAV clip becomes each scene clip audio
- Image timing:
  - minimum clip duration from scene timing plus trailing silence settings
- Transitions:
  - none beyond clip concatenation
- Captions:
  - generic render command can burn captions when `.ass` exists
  - episode dark-truth wrapper renders clean video only
- Overlays:
  - none in the main story workflow
- Output codec:
  - clip renders use FFmpeg defaults defined by the renderer; final concat uses `-c copy`
- Temporary files:
  - `concat.txt`
  - per-scene clip manifests
- Final output paths:
  - `<variant>/video/*-clean.mp4`
  - generic render path `renders/<profile>/youtube-16x9...-clean.mp4` or `youtube-9x16...-clean.mp4`
- Cleanup:
  - stale clip reuse is bypassed automatically when fingerprints differ

## 16. Thumbnail Generation

- Full and short thumbnail dimensions:
  - full `1536x864`
  - short `864x1536`
- Locale-specific text:
  - locale is a required input to the thumbnail service
- Provider:
  - OpenAI Images
- Persistence:
  - PNG thumbnail + manifest
- Validation:
  - input schema, workspace-safe reference paths, fingerprint reuse

## 17. Metadata Generation

- YouTube metadata:
  - fully implemented through `metadata youtube`
- TikTok metadata:
  - heuristic library support only
  - no CLI producer and no publisher
- Chapters:
  - derived from scene timings
- Titles, descriptions, tags, hashtags:
  - generated by the OpenAI metadata service or heuristically in library helpers
- Persistence:
  - `youtube-metadata.json`
  - text derivatives
- Validation:
  - schema + local logical checks

## 18. Publishing

- Upload command: `mediaforge youtube upload`
- Authentication boundary:
  - YouTube OAuth credentials are required
  - refresh token and channel ID can vary by language
- Platform API:
  - `googleapis` YouTube v3 client
- Publish state:
  - report `status` is `planned|uploaded|failed|skipped`
- Retries:
  - retryable API errors are marked in the report
- Idempotency:
  - existing upload report prevents duplicate work unless `--force`
- Persisted remote IDs:
  - `youtubeVideoId`, channel ID, request IDs in upload report

## 19. Persistence and Artifact Layout

Example verified from [`episodes/014-hachishakusama-the-eight-foot-woman`](../episodes/014-hachishakusama-the-eight-foot-woman):

```text
episodes/<episode-slug>/
  current-artifact.json
  manifest.json
  manifests/
    en-full.json
  source/
    <episode>-en-full.md
    source-original.md
    source-cleaned.md
    source-cleaning-report.json
  .localization-cache/
    entries/*.json
    facts/*.json
  debug/
    stories-rewrite-full-*.prompt.md
    stories-rewrite-full-*.request.json
    stories-rewrite-full-*.response.json
  en/
    full/
      canonical-full.json
      script.md
      analysis.json
      metadata.json
      narration.txt
      speech-plan.json
      production-instructions.json
      pronunciation-guide.json
      sound-cues.json
      qa-report.json
      audio/
        narration.wav
        narration-manifest.json
        segments.txt
      subtitles/
        narration.en.srt
        narration.en.vtt
    short/
      script.md
  de/
    full/script.md
    audio/prompts/*.json
  shared/
    scenes.json
    visual-plan.json
    image-manifest.json
    images/generated/*.png
    short/images/shorts-image-manifest.json
  state/
    image-generation/
      checkpoints/*.json
      manifests/*.json
      failures/*.json
      provider-requests/*.json
      provider-responses/*.json
    upload/
      reports/youtube-upload.json
      thumbnails/youtube-thumbnail.jpg
  reviews/
    en/full/
      checklist.md
      regeneration-instructions.json
      review-package.json
      approval.json
```

Important producers and consumers:

- `source-cleaned.md`
  - producer: source cleaning
  - consumer: rewrite services
- `canonical-full.json`
  - producer: canonical full rewrite
  - consumer: localized full rewrite, production analysis
- `<lang>/full/script.md`
  - producer: rewrite services
  - consumer: production analysis, audio generation, media prep
- `shared/scenes.json`
  - producer: canonical media prep
  - consumer: images, render, metadata
- `shared/image-manifest.json`
  - producer: image generation
  - consumer: review package, short image prep
- `audio/narration.wav`
  - producer: speech generation
  - consumer: scene slicing, render
- `render.json`
  - producer: renderer
  - consumer: operators and later upload selection
- `youtube-upload.json`
  - producer: uploader
  - consumer: operators

## 20. Cache, Resume, and Invalidation

- Story rewrite cache:
  - per-episode `.localization-cache`
  - key inputs: source hash, configuration hash, prompt version, model, language, variant, parent lineage
- Canonical full resume:
  - `resolveCanonicalEnglishFullResume`
- Production analysis cache:
  - current only when source content fingerprint, source lineage fingerprint, model, and reasoning all still match
- Audio cache:
  - narration manifest requires speech-plan hash and voice-profile hash match
- Image cache:
  - per-scene manifests, checkpoints, failures, and prompt/provider hashes
- Render cache:
  - per-scene clip manifest keyed by scene/image/audio/caption/render fingerprint
- Force regeneration:
  - `--force` supported on rewrite, analysis, images, episode media, metadata, and upload commands
- Resume:
  - `--resume` on story rewrites
  - `images resume` for scene image recovery
- Stale detection:
  - approval hash mismatch
  - render clip fingerprint mismatch
  - source lineage mismatch
  - source newer than cache artifact

## 21. Error Handling and Repair Routing

- Failure classes are explicit in several subsystems:
  - story retries: `repair`, `regenerate`, or `block`
  - image failures: transient, rate-limit, policy, decode, dimension, filesystem, and more
  - upload failures: retryable or terminal `YoutubeUploadError`
- Manual intervention is required for:
  - stale/missing approvals
  - `BLOCKED` production analysis
  - missing credentials
  - unresolved non-retryable image failures
- Exit codes:
  - `stories analyze` exits `1` when `pass` is false
  - `stories rewrite-short` sets exit code `1` when any language failed
  - metadata/upload commands set non-zero exit codes on failures

## 22. Cost and Telemetry

- CLI npm scripts wrap commands through [`scripts/run-with-telemetry.mjs`](../scripts/run-with-telemetry.mjs).
- Execution telemetry:
  - execution ID
  - command and argv
  - API calls
  - process executions
  - generated images
  - estimated costs by provider/model/operation
- Persisted execution reports:
  - `.mediaforge/reports/<executionId>.json` via [`packages/observability/src/telemetry.ts`](../packages/observability/src/telemetry.ts)
- Story rewrite cost tracking:
  - request fingerprints and estimated token cost fields in story artifacts
- Metadata/image/thumbnail/upload services also record telemetry when run under the wrapper.

## 23. Observability

- Structured logs use `pino`.
- Correlation fields:
  - `executionId`
  - `episodeId`
  - provider/model/operation
- Diagnostic commands:
  - `episode inspect`
  - `episode status`
  - `stories inspect`
  - `stories status`
  - `stories:batches status|show|verify-index|rebuild-index`
  - `images status|validate|missing|resume`
  - `render remote status|logs`

## 24. State Machine

- Story batch states:
  - `prepared -> submitted -> validating -> in_progress -> finalizing -> completed`
  - plus `partially_completed`, `failed`, `expired`, `cancelling`, `cancelled`, `imported`, `imported_with_failures`
- Story analysis states:
  - `MISSING`, `STALE`, `CURRENT`, `MISMATCHED_SOURCE`
- Review states:
  - `awaiting-human-review`, `human-approved`, `human-rejected`
- Media stage statuses used across image/render/upload manifests:
  - `planned`, `ready`, `generated`, `reused`, `uploaded`, `failed`

## 25. Operational Runbooks

### New full episode

1. `mediaforge stories rewrite-full --episode <slug-or-number> --output-root ./episodes`
2. `mediaforge stories analyze --episode <slug-or-number> --output-root ./episodes`
3. `mediaforge episode review approve --episode <slug-or-number> --output-root ./episodes --reviewer <name>`
4. `mediaforge episode english --episode <slug-or-number> --output-root ./episodes`
5. `mediaforge metadata youtube --episode <slug-or-number>`
6. `mediaforge youtube upload --episode <slug-or-number>`

### Localized full episode

1. `mediaforge stories rewrite-full --episode <slug-or-number> --languages de,es,fr --output-root ./episodes`
2. `mediaforge episode review approve --episode <slug-or-number> --language en --artifact full --output-root ./episodes --reviewer <name>`
3. `mediaforge episode localized --episode <slug-or-number> --languages de,es,fr --output-root ./episodes --reuse-images`

### Localized short

1. `mediaforge stories rewrite-short --episode <slug-or-number> --languages de,es,fr --output-root ./episodes`
2. Ensure short source files exist in the episode-pack shape if using `episode short`
3. `mediaforge episode short --episode <slug-or-number> --language de --output-root ./episodes --reuse-images`

### Resume failed generation

- Story text: rerun `stories rewrite-full` or `stories rewrite-short` with `--resume`
- Images: `mediaforge images resume --episode <episode-id>`
- Batches: `mediaforge stories:batches refresh`, then `import-ready` or `retry-failed --batch <id>`

### Regenerate audio only

- `mediaforge audio generate <episode-id>`
- localized: `mediaforge audio generate-localized <episode-id> --languages de,es,fr`

### Regenerate images only

- `mediaforge images generate --episode <episode-id> --force`
- resume partials: `mediaforge images resume --episode <episode-id> --force`

### Rerender without regeneration

- `mediaforge render <episode-id> --profile youtube --no-captions`
- vertical: `mediaforge render <episode-id> --profile vertical`

### Inspect production status

- `mediaforge stories status --episode <slug-or-number> --output-root ./episodes`
- `mediaforge episode status --episode <slug-or-number> --output-root ./episodes`

### Publish existing output

- `mediaforge youtube upload --episode <episode-id> --metadata-path <path> --thumbnail-path <path> --video-path <path>`

### Recover from a blocked or failed stage

1. Inspect `story-production-analysis.json`, review packages, or batch manifests.
2. If `BLOCKED`, fix lineage/provenance/content manually and rerun rewrite or analysis.
3. If image failures are non-retryable, resolve prompt/reference issue and rerun `images generate --force`.
4. If upload failed retryably, rerun `youtube upload --episode <id> --force`.

## 26. Known Gaps and Ambiguities

- There is no single end-to-end command that starts from a brand-new source story and carries through upload.
- The implemented workflow is split across story rewrite commands, episode media commands, metadata commands, and upload commands.
- `episode english|localized|short` consume source-pack markdown files and/or already-rewritten workspace scripts; they do not directly invoke the story rewrite service.
- The story-specific route does not run Whisper on generated narration. Subtitle/timing artifacts are synthesized from speech plans instead.
- `generateNarrationAudio` in the dark-truth package currently delegates to `generateMockNarrationAudio`, which still routes through `createSpeechProvider`; the name is legacy and not a guarantee of fake output.
- TikTok publishing does not exist.
- TikTok metadata is only heuristic library code, not a CLI workflow.
- The vertical shorts strategy records `pan-and-scan` motion metadata but does not implement a distinct motion-video compositor.
- Production-readiness analysis supports `full` only; there is no short readiness analyzer.
- `episode analyze`, `episode plan`, `episode validate`, and `episode review prepare` are aliases of `episode dry-run`, not distinct implemented processing stages.
