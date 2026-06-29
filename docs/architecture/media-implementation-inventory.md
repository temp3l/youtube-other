# Media Implementation Inventory

This audit is limited to media-generation and media-pipeline tasks. `apps/cli` is the authoritative operator surface; package classifications below are based on active callers and tests in the current repo.

## Caller Map

Primary caller evidence:

- `apps/cli/src/index.ts` registers the general `create`, `run`, `images`, `render`, and `metadata` command families.
- `apps/cli/src/index.ts` calls `createPipeline()` for `create`, `run`, localized audio generation, localized clip generation, and render paths.
- `apps/cli/src/episode-commands.ts` registers the separate `episode` command family and builds media workflows through `@mediaforge/dark-truth`.
- `apps/api/src/index.ts` also boots `createPipeline()` directly.
- Tests keep both orchestration paths live: `packages/pipeline/src/index.unit.test.ts`, `packages/pipeline/src/index.e2e.test.ts`, `packages/dark-truth/src/index.unit.test.ts`, `apps/cli/src/episode-commands.unit.test.ts`, and `apps/cli/src/images-resume-command.unit.test.ts`.

## Classification Legend

- `canonical`: active default path or directly user-facing utility surface.
- `supported-adapter`: active alternate strategy with distinct operational value.
- `legacy`: active but overlapping path that should remain until a compatibility plan exists.
- `experimental`: active niche path or fallback with narrower guarantees.

## Audio

### Canonical

- `apps/cli/src/index.ts`
  - Localized narration generation is a direct CLI utility surface.
  - Uses `createPipeline()` plus `pipeline.speech.synthesize()` semantics indirectly, then writes localized reports and manifest artifacts itself.
  - Still constructs localized audio paths partly ad hoc through helpers like `localizedAudioBaseDir()`, `localizedSegmentsDirFromBase()`, and `localizedNarrationPathFromBase()`.
- `packages/pipeline/src/index.ts`
  - Active orchestration layer for speech provider selection through `MockSpeechProvider` and `OpenAiCompatibleSpeechProvider`.
  - Owns speech settings loading, provider construction, and pipeline-stage narration generation for the `run` flow.
- `packages/speech/src/index.ts`
  - Canonical speech provider port and provider implementations.
  - `loadSpeechVoiceSettings()` is the shared voice policy surface used by both `pipeline` and `dark-truth`.

### Legacy

- `packages/dark-truth/src/index.ts`
  - `generateNarrationAudio()`, `inspectAudioDurationSeconds()`, and `sliceSceneAudioFiles()` form a separate audio orchestration path used by `apps/cli/src/episode-commands.ts`.
  - Repeats provider selection, duration inspection, segment slicing, and artifact bookkeeping outside `pipeline`.

### Overlaps and Risks

- Both `pipeline` and `dark-truth` construct speech providers and voice settings.
- CLI localized audio generation mixes canonical provider usage with CLI-owned chunking, concat, cleanup, and manifest writes.
- Audio observability is split across pipeline telemetry, CLI generation reports, and `dark-truth` generation manifests.

## Images

### Canonical

- `packages/image-generation/src/episode-image-pipeline.ts`
  - Canonical synchronous scene pipeline.
  - Exposes `planEpisodeImageGeneration()`, `generateEpisodeImages()`, character reference generation and approval helpers, manifest persistence, retryability flags, prompt and provider request logging, and shared-image sync.
  - Used by `apps/cli/src/index.ts` `images plan`, `images generate`, character reference commands, and resume-related tests.
- `apps/cli/src/index.ts`
  - Direct `images` subcommands are canonical operator surfaces for planning, generation, character reference approval, status, and resume.

### Supported Adapter

- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-storage.ts`
  - Active batch-image strategy with its own manifest, storage plan, retry lineage, usage fields, and readiness summaries.
  - Backed by unit tests.
  - Intentionally different from synchronous generation rather than dead duplication.
- `packages/story-localization/src/story-localization-batch-service.ts` and related batch storage
  - Cross-package dependency surface for batch infrastructure patterns that image batch currently resembles and partially depends on conceptually.

### Legacy

- `packages/image-generation/src/openai-image.ts`
  - Raw helper flow used by `apps/cli/src/index.ts` `images generate-openai`.
  - Active direct provider path, but it bypasses the richer scene manifest and state model in `episode-image-pipeline.ts`.
- `packages/image-generation/src/index.ts` workbook/import utilities
  - `exportSceneWorkbook()`, `importImageAssets()`, and `validateImageAssets()` still back active CLI commands for OpenArt/manual workflows.
  - These remain active until parity with the canonical sync or batch pipeline is proven.
- `packages/dark-truth/src/index.ts`
  - `generateCanonicalImages()` and shorts image preparation produce a separate image path for `episode english`, `episode localized`, and `episode short`.

### Experimental

- `packages/image-generation/src/shorts-image-strategy.ts`
  - Active and tested, but specialized to shorts preparation with its own `shorts-image-manifest.json`.

### Overlaps and Risks

- Scene manifests exist in multiple shapes:
  - sync image manifests in `state/image-generation/manifests/*.json`
  - image batch manifests and batch indexes
  - shared `image-manifest.json`
  - `shorts-image-manifest.json`
- CLI exposes both canonical sync commands and manual workbook/import commands.
- `openai-image.ts` duplicates provider mapping and output normalization outside the canonical sync pipeline.
- Resume logic exists in both the sync pipeline and batch retry lineage, with different persistence models.

## Video

### Canonical

- `packages/rendering/src/index.ts`
  - Canonical `VideoRenderer` port.
  - `FFmpegVideoRenderer` is the default local renderer.
  - Used through `pipeline.renderer.render()` and `pipeline.renderer.renderSceneClips()` from `apps/cli/src/index.ts`.
- `apps/cli/src/index.ts`
  - Direct `render` and localized clip commands are canonical operator surfaces.
  - `backfillSceneClipManifests()` is exposed as an explicit repair utility.

### Supported Adapter

- `packages/rendering/src/index.ts` `HybridFFmpegVideoRenderer`
  - Active local-plus-remote strategy with remote preflight, cleanup, and test commands in the CLI.
  - Remote rendering is not dead code; it is an intentional execution adapter.

### Legacy

- `packages/dark-truth/src/index.ts`
  - `renderCleanVideo()` uses `FFmpegVideoRenderer` directly as part of the separate `episode` orchestration path.
  - Keeps render invocation and artifact packaging outside `pipeline`.

### Overlaps and Risks

- Clip manifest production is centralized in `packages/rendering`, but render callers still choose output roots and localized clip directory names ad hoc.
- `dark-truth` and general CLI flows both compose render requests separately.

## Metadata

### Canonical

- `packages/metadata/src/youtube-metadata.ts`
  - `generateYoutubeMetadataForTarget()` is the canonical AI-backed metadata contract.
  - `generateYoutubeMetadataFromScenesFile()` is a convenience wrapper still used by the CLI.
- `apps/cli/src/index.ts`
  - `metadata youtube` drives `generateYoutubeMetadataForTarget()` for episode workspaces.
  - Another CLI path calls `generateYoutubeMetadataFromScenesFile()` directly.

### Legacy

- `packages/metadata/src/index.ts` `HeuristicMetadataProvider`
  - Active, tested fallback metadata provider.
  - Not dead code, but it is a competing generation contract compared with the AI-backed YouTube metadata flow.

### Overlaps and Risks

- Two metadata contracts coexist:
  - AI-backed target-and-output generation
  - heuristic in-memory `PublishingMetadata`
- Localized metadata formatting helpers live beside the AI-backed generator, but orchestration ownership is not unified.

## Cross-Cutting Surfaces

### Canonical Foundations

- `packages/shared/src/episode-filesystem.ts`
  - `createEpisodePathResolver()` is the clearest canonical path policy surface.
  - Owns workspace-safe episode, locale, render, clip, image, metadata, and state path resolution.
- `packages/shared/src/index.ts`
  - Still exports older file utilities and some path helpers that callers mix with ad hoc `path.join()` logic.

### Active Supporting Implementations

- `packages/image-generation/src/episode-image-pipeline.ts`
  - Provider request and response snapshots, checkpoints, failure files, retryability flags, per-scene manifests, and telemetry cost recording.
- `packages/image-generation/src/image-batch-service.ts`
  - Batch storage layout, manifest lineage, retry numbering, import state, and usage capture.
- `packages/rendering/src/index.ts`
  - Scene clip manifests and backfill tooling.
- `apps/cli/src/index.ts`
  - Execution telemetry wiring through `createExecutionTelemetry()` and `withExecutionTelemetry()`.
- `packages/story-localization/src/*.schemas.ts`, `packages/image-generation/src/image-batch.schemas.ts`, `packages/story-localization/src/story-localization.schemas.ts`
  - Existing schema ownership is already Zod-heavy across orchestration boundaries.

### Active Friction

- Path construction is partly centralized and partly ad hoc.
  - Resolver-backed paths exist in `packages/shared/src/episode-filesystem.ts`.
  - Localized audio, render, and metadata helpers in `apps/cli/src/index.ts` still build paths separately.
  - `packages/dark-truth/src/index.ts` writes `generation-manifest.json`, `shared/image-manifest.json`, and shorts outputs with its own path rules.
- Manifests overlap across images, clips, batches, localized audio reports, and generation reports.
- Retry and resume logic exists separately in sync image generation, image batch retries, story-localization batch flows, and CLI retry commands.
- Observability and usage accounting are not owned by a single orchestration layer.

## Summary

Duplicates to consolidate:

- audio orchestration in CLI, `pipeline`, and `dark-truth`
- image orchestration in sync, batch, raw OpenAI, workbook/import, and `dark-truth`
- video workflow construction in CLI, `pipeline`, and `dark-truth`
- metadata generation contracts in AI-backed and heuristic forms

Intentional alternatives to preserve:

- sync versus batch image generation
- local versus hybrid or remote rendering
- direct CLI media utilities for operators

Conflicting path or manifest zones:

- localized audio, localized renders, localized metadata
- `generation-manifest.json`, `image-manifest.json`, `shorts-image-manifest.json`, clip sidecars, batch manifests, and generation reports

High-risk migration zones:

- moving `dark-truth` callers without losing multilingual production behavior
- changing path resolution without harmonizing localized outputs
- merging retry or resume behavior across sync and batch image systems
- changing manifest ownership without characterization tests around CLI outputs

Missing-test pressure points:

- cross-package compatibility between sync image manifests, batch manifests, and CLI resume behavior
- characterization of localized path outputs versus `createEpisodePathResolver()`
- metadata fallback behavior when AI-backed generation is unavailable
