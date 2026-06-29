# Media Consolidation Plan

This plan is limited to media-generation and media-pipeline tasks. It sequences incremental refactors around active caller evidence in `apps/cli`, `packages/pipeline`, `packages/dark-truth`, `packages/image-generation`, `packages/rendering`, `packages/metadata`, `packages/speech`, `packages/shared`, and related tests.

## Execution Rules

- Preserve `apps/cli` as the primary operator surface during migration.
- Characterization tests land before behavioral refactors.
- Prefer compatibility adapters over large cutovers.
- Use `gpt-5.4-mini` for bounded mechanical migrations.
- Use `gpt-5.4` for orchestration, paths, manifests, compatibility, and adapter extraction.

## Baseline Characterization Validations

- `pnpm test:unit -- packages/metadata/src/youtube-metadata.unit.test.ts`
- `pnpm test:integration -- packages/metadata/src/youtube-metadata.integration.test.ts`
- `pnpm test:unit -- packages/speech/src/index.unit.test.ts`
- `pnpm test:unit -- packages/dark-truth/src/index.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/image-batch-service.unit.test.ts`
- `pnpm test:unit -- packages/rendering/src/index.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/images-resume-command.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/episode-commands.unit.test.ts`
- `pnpm test:unit -- packages/shared/src/episode-filesystem.unit.test.ts`

## Phase 1: Metadata Generation

Competing implementations:

- `packages/metadata/src/youtube-metadata.ts` `generateYoutubeMetadataForTarget()`
- `packages/metadata/src/youtube-metadata.ts` `generateYoutubeMetadataFromScenesFile()`
- `packages/metadata/src/index.ts` `HeuristicMetadataProvider`

Canonical contract to converge on:

- `MetadataGenerator` that accepts episode context plus validated source inputs and returns durable publishing outputs and in-memory `PublishingMetadata`.

Compatibility adapter plan:

- keep `generateYoutubeMetadataFromScenesFile()` as a wrapper over the canonical target-based generator
- wrap `HeuristicMetadataProvider` behind a fallback adapter instead of exposing it as a competing primary contract

Callers to migrate first:

- `apps/cli/src/index.ts` `metadata youtube`
- any direct scenes-file metadata command paths in the CLI

Characterization tests to add before refactor:

- CLI-level tests proving current output paths for localized metadata
- fallback tests proving heuristic metadata can still satisfy `PublishingMetadata` callers when AI generation is unavailable

Targeted validation commands:

- `pnpm test:unit -- packages/metadata/src/youtube-metadata.unit.test.ts`
- `pnpm test:integration -- packages/metadata/src/youtube-metadata.integration.test.ts`

Observability fields to preserve:

- model
- prompt version
- language
- retries
- timeout configuration
- output file paths

Rollback and removal gates:

- all CLI metadata commands still write the same durable outputs
- fallback heuristic path remains reachable through adapter coverage
- no callers instantiate `HeuristicMetadataProvider` directly before removal

Suggested session sizing:

- adapter extraction: `gpt-5.4`
- wrapper cleanup and call-site rewrites: `gpt-5.4-mini`

## Phase 2: Audio Generation

Competing implementations:

- localized narration generation in `apps/cli/src/index.ts`
- speech orchestration in `packages/pipeline/src/index.ts`
- provider implementations in `packages/speech/src/index.ts`
- narration helpers in `packages/dark-truth/src/index.ts`

Canonical contract to converge on:

- `AudioGenerator` over `packages/speech` provider implementations, with orchestration-owned chunking, concat, retries, manifests, and usage.

Compatibility adapter plan:

- first extract CLI localized audio generation behind a shared `AudioGenerator`
- then adapt `dark-truth` `generateNarrationAudio()` and `sliceSceneAudioFiles()` onto that contract

Callers to migrate first:

- localized audio commands in `apps/cli/src/index.ts`
- pipeline narration stage in `packages/pipeline`
- `dark-truth` episode flow last

Characterization tests to add before refactor:

- path and artifact tests for localized narration outputs versus current CLI helpers
- tests covering single-threaded fallback after concurrent synthesis failure
- tests pinning `dark-truth` scene slicing behavior

Targeted validation commands:

- `pnpm test:unit -- packages/speech/src/index.unit.test.ts`
- `pnpm test:unit -- packages/dark-truth/src/index.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/episode-commands.unit.test.ts`

Observability fields to preserve:

- episode id
- language
- voice preset
- model
- voice
- segment count
- narration path
- generated-at timestamps

Rollback and removal gates:

- localized CLI outputs still land in current locations until resolver migration is complete
- `dark-truth` narration commands retain equivalent duration and slicing behavior
- no regression in provider error handling or fallback concurrency behavior

Suggested session sizing:

- orchestration extraction and compatibility design: `gpt-5.4`
- call-site rewrites and report-field normalization: `gpt-5.4-mini`

## Phase 3: Image Generation

Competing implementations:

- `packages/image-generation/src/episode-image-pipeline.ts` sync pipeline
- `packages/image-generation/src/image-batch-planner.ts` plus `image-batch-service.ts`
- `packages/image-generation/src/openai-image.ts`
- workbook and import flows in `packages/image-generation/src/index.ts` and `apps/cli/src/index.ts`
- `packages/dark-truth/src/index.ts` canonical and shorts image flows

Canonical contract to converge on:

- `ImageGenerator` with explicit `imageMode` selection for `synchronous` versus `batch`, shared scene-level result shape, shared usage reporting, and resolver-backed state paths.

Compatibility adapter plan:

- keep sync pipeline as first canonical implementation
- wrap batch planner and service as a supported strategy adapter
- wrap raw OpenAI generation as a compatibility adapter until removed
- keep workbook/import as legacy adapters until operator parity is proven
- keep `dark-truth` image helpers behind compatibility until multilingual episode callers migrate

Callers to migrate first:

- `apps/cli/src/index.ts` `images plan` and `images generate`
- image resume and image status surfaces
- raw OpenAI helper command
- workbook/import utilities
- `dark-truth` callers last

Characterization tests to add before refactor:

- manifest shape tests across sync image generation
- cross-check tests between sync outputs and resume behavior
- compatibility tests for batch retry lineage and imported asset state
- tests pinning workbook export and import expectations while the legacy path remains

Targeted validation commands:

- `pnpm test:unit -- packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/image-batch-service.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/images-resume-command.unit.test.ts`

Observability fields to preserve:

- scene id
- provider request and response snapshots
- retryable flags
- failure stage
- batch ids
- retry number
- usage and estimated cost fields

Rollback and removal gates:

- sync path remains fully functional before batch integration changes land
- batch import and retry behavior stays intact under characterization coverage
- workbook/import commands are not removed until documented operator parity exists
- `dark-truth` image callers still produce approved multilingual artifacts

Suggested session sizing:

- strategy interface, manifest convergence, and compatibility adapters: `gpt-5.4`
- mechanical caller rewrites and state-path substitutions: `gpt-5.4-mini`

## Phase 4: Video Rendering

Competing implementations:

- `packages/rendering/src/index.ts` `FFmpegVideoRenderer`
- `packages/rendering/src/index.ts` `HybridFFmpegVideoRenderer`
- direct CLI render and clip commands in `apps/cli/src/index.ts`
- clip-manifest repair in `backfillSceneClipManifests()`
- `packages/dark-truth/src/index.ts` render helpers

Canonical contract to converge on:

- `VideoRenderer` with explicit `renderMode` selection and one orchestration-owned render request builder.

Compatibility adapter plan:

- preserve `FFmpegVideoRenderer` as the local adapter
- preserve `HybridFFmpegVideoRenderer` as the remote-capable adapter
- move CLI and `dark-truth` request construction behind shared orchestration helpers
- keep clip-manifest backfill as a repair adapter

Callers to migrate first:

- general CLI render commands
- localized clip generation
- remote test or preflight helpers
- `dark-truth` render caller last

Characterization tests to add before refactor:

- clip manifest path tests for localized and non-localized outputs
- render request builder tests for profile, captions, and trailing silence settings
- remote fallback tests if not already covered

Targeted validation commands:

- `pnpm test:unit -- packages/rendering/src/index.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/episode-commands.unit.test.ts`

Observability fields to preserve:

- render profile
- width and height
- fps
- caption burn-in state
- renderer kind
- validation result fields
- clip and final output hashes

Rollback and removal gates:

- local rendering remains stable independent of remote settings
- hybrid mode still falls back cleanly
- clip sidecar manifests remain readable and backfillable

Suggested session sizing:

- render request normalization and mode strategy extraction: `gpt-5.4`
- command rewires and manifest-path updates: `gpt-5.4-mini`

## Phase 5: End-to-End Orchestration

Competing implementations:

- `apps/cli/src/index.ts`
- `packages/pipeline/src/index.ts`
- `packages/dark-truth/src/index.ts`

Canonical contract to converge on:

- one orchestration layer that owns media use cases, explicit strategy selection, retries, idempotency, manifests, progress, and usage collection.

Compatibility adapter plan:

- extract orchestration use cases from CLI and `dark-truth`
- keep CLI commands thin and map them to shared use cases
- keep `dark-truth` entrypoints as adapters over shared use cases until multilingual parity is proven

Callers to migrate first:

- `apps/api`
- `apps/cli` `create` and `run`
- localized media utilities
- `episode` command family last

Characterization tests to add before refactor:

- tests pinning `create` and `run` stage ordering
- CLI smoke-level tests around JSON outputs and manifest writes
- path characterization against `createEpisodePathResolver()`

Targeted validation commands:

- `pnpm test:unit -- apps/cli/src/episode-commands.unit.test.ts`
- `pnpm test:unit -- packages/shared/src/episode-filesystem.unit.test.ts`
- `pnpm test:unit -- packages/dark-truth/src/index.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Observability fields to preserve:

- episode id
- stage names
- start and end timestamps
- warnings
- output paths
- usage totals
- cost totals

Rollback and removal gates:

- CLI command outputs remain stable
- `apps/api` still boots a valid orchestration surface
- `episode` command family retains current behavior until explicit sign-off

Suggested session sizing:

- orchestration extraction and compatibility layering: `gpt-5.4`
- bounded command rewiring: `gpt-5.4-mini`

## Phase 6: Legacy Removal

Removal targets once compatibility gates are met:

- direct `HeuristicMetadataProvider` callers
- raw OpenAI image helper command path if fully replaced
- workbook/import image path only after operator parity
- `dark-truth` media orchestration helpers only after episode command migration
- ad hoc localized path builders after resolver-backed migration

Canonical contract to converge on:

- callers invoke only shared media use cases plus explicit strategies

Compatibility adapter plan:

- remove adapters only after call sites and characterization tests are clean
- keep manifest readers for one release window if stored state compatibility matters

Callers to migrate first:

- none; this phase starts only after earlier phases close their rollback gates

Characterization tests to add before refactor:

- deletion-proof tests asserting no caller references removed legacy entrypoints
- fixture-based compatibility tests for old manifest inputs where needed

Targeted validation commands:

- `pnpm test:unit -- packages/shared/src/episode-filesystem.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/episode-commands.unit.test.ts`

Observability fields to preserve:

- backward-readable manifest metadata where retained
- deprecation warnings during transition windows

Rollback and removal gates:

- no active CLI, API, or tests import the legacy surface
- stored manifests and outputs remain readable through compatibility readers if still required
- docs are updated in the same change set as final removals
