# Story Image Batch Processing Plan

## 1. Executive summary

Add asynchronous OpenAI image Batch API support alongside the existing synchronous image-generation path. The goal is to batch validated scene image prompts for `/v1/images/generations`, submit them through the official OpenAI Node.js SDK, persist local and remote batch state, and import completed results back into the existing episode/image manifests without breaking the current synchronous workflow.

The implementation should reuse the repository’s existing translation batch infrastructure where it already solves the same problems: JSONL input creation, batch manifests, batch index, locking, status refresh, import, retry lineage, and CLI recovery commands. The image feature should extend that infrastructure rather than creating a separate parallel batch system.

Default behavior must remain synchronous for existing commands. Batch mode must be explicit.

## Implementation log

### Phase 1 completed

- Repository discovery finished.
- Confirmed `openai@6.44.0` supports batch file upload, batch creation/retrieval/cancellation, file-content download, and image generation endpoints.
- Confirmed the synchronous image path remains in `packages/image-generation/src/openai-image.ts` and `packages/image-generation/src/episode-image-pipeline.ts`.

### Phase 2 completed

Completed work:

- Added batch-category and batch-endpoint typing to the shared batch model.
- Added image batch status, item status, failure-class, readiness, cost-record, and manifest types.
- Added image batch schemas alongside the existing text-localization schemas.
- Extended batch storage defaults so manifests can record a category and endpoint without breaking existing text batches.
- Bumped the shared batch index schema version to `story-localization-batch-index-v2`.
- Extended batch index filtering with category support and added backward-compatible defaulting for older index files.

Changed files:

- `packages/story-localization/src/story-localization.types.ts`
- `packages/story-localization/src/story-localization.schemas.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
- `packages/story-localization/src/story-localization-batch-index.ts`

Validation:

- `./node_modules/.bin/tsc -p packages/story-localization/tsconfig.json --noEmit`
- `./node_modules/.bin/tsc -p packages/image-generation/tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run packages/story-localization/src/story-localization.unit.test.ts packages/story-localization/src/story-localization.batch.integration.test.ts`
- `./node_modules/.bin/vitest run packages/image-generation/src/index.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/shorts-image-strategy.unit.test.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Remaining tasks:

- implement image batch planning and JSONL generation
- implement submission/status/import/retry for image batches
- wire image batch CLI commands and render-readiness checks
- add targeted image batch tests and migration coverage for image manifests

### Phase 3 completed

Completed work:

- Added a dedicated image-batch planner in `packages/image-generation/src/image-batch-planner.ts`.
- Added image-batch storage helpers in `packages/image-generation/src/image-batch-storage.ts`.
- Added image-batch local types and schemas in `packages/image-generation/src/image-batch.types.ts` and `packages/image-generation/src/image-batch.schemas.ts`.
- Reused persisted scene prompt files from `state/image-generation/prompts/<sceneId>.txt`, falling back to the existing scene manifest prompt only when the prompt file is missing.
- Built deterministic custom IDs and generation configuration hashes for each scene.
- Skipped reusable scenes when the existing scene manifest and output image already satisfy the current request shape.
- Wrote JSONL input plus an image-batch manifest into the episode’s `generated-assets/.batch` storage tree.
- Kept synchronous image generation untouched.

Changed files:

- `packages/image-generation/src/image-batch.types.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch-storage.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/index.ts`
- `packages/image-generation/package.json`

Validation:

- `./node_modules/.bin/tsc -p packages/image-generation/tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run packages/image-generation/src/image-batch-planner.unit.test.ts packages/image-generation/src/index.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/shorts-image-strategy.unit.test.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Remaining tasks:

- implement batch submission and remote lifecycle handling
- download and import completed batch outputs
- add retry and failure-classification logic
- wire CLI commands and render-readiness checks to the new batch path
- update the shared batch index with image entries

### Phase 4 completed

Completed work:

- Added image-batch submission and refresh lifecycle functions in `packages/image-generation/src/image-batch-service.ts`.
- Reused the existing OpenAI batch client surface from `@mediaforge/story-localization` for batch upload, creation, and retrieval.
- Updated the shared batch index from image batches using the new image batch category and image details.
- Kept the batch manifest in sync with remote OpenAI file and batch identifiers.
- Preserved the synchronous image-generation path unchanged.

Changed files:

- `packages/story-localization/src/story-localization-openai-batch.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/index.ts`

Validation:

- `./node_modules/.bin/tsc -p packages/image-generation/tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run packages/image-generation/src/image-batch-planner.unit.test.ts packages/image-generation/src/image-batch-service.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/shorts-image-strategy.unit.test.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Remaining tasks:

- download output and error files from completed batches
- decode and validate returned base64 image payloads
- atomically persist imported images and update scene/episode manifests
- add retry and policy-repair flows for failed image items
- wire the CLI and render-readiness checks to the new batch lifecycle

## 2. Repository findings

Package manager and runtime:

- `packageManager`: `pnpm@10.16.0`
- Node engine: `>=22.0.0`
- Root scripts already include `images:plan`, `images:generate`, `images:generate-openai`, `stories:localize`, and `stories:batches`.

OpenAI SDK:

- Installed package: `openai@6.44.0`
- Verified methods available in the installed SDK:
  - `client.files.create({ file, purpose: 'batch' })`
  - `client.files.content(fileId)`
  - `client.batches.create(...)`
  - `client.batches.retrieve(batchId)`
  - `client.batches.cancel(batchId)`
  - `client.images.generate(...)`
  - `client.images.edit(...)`
- Verified batch endpoint support in the SDK type surface:
  - `/v1/images/generations`
  - `/v1/images/edits`

Relevant existing docs:

- `docs/episode-image-generation.md`
- `docs/openart-workflow.md`
- `docs/provider-interfaces.md`
- `docs/cli.md`
- `docs/troubleshooting.md`
- `docs/publishing-output.md`
- `docs/dark-truth-multilingual-production.md`
- `docs/plans/story-localization-batch-pipeline.md`

## 3. Existing implementation map

### Image generation package

Files and discovered exports:

- `packages/image-generation/src/index.ts`
  - exports `generateOpenAiSceneImages`, `loadOpenAiImageGenerationSettings` from `./openai-image.js`
  - re-exports `*` from `./shorts-image-strategy.js`
  - re-exports `*` from `./episode-image-pipeline.js`
  - contains `createImagePrompt`, `createPromptBatch`, `exportSceneWorkbook`
- `packages/image-generation/src/openai-image.ts`
  - exports `OpenAiImageGenerationSettings`
  - exports `OpenAiImageGenerationJob`
  - exports `OpenAiImageGenerationResult`
  - exports `OpenAiImageClientLike`
  - synchronous path currently calls `client.images.generate` and `client.images.edit`
- `packages/image-generation/src/episode-image-pipeline.ts`
  - exports `buildPromptFromSpec`
  - exports `planEpisodeImageGeneration`
  - exports `generateEpisodeImages`
  - existing output paths include:
    - `state/image-generation/manifests/<sceneId>.json`
    - `state/image-generation/prompts/<sceneId>.txt`
    - `generated-assets/images/<sceneId>.png`
    - `generated-assets/character-references/<characterId>.png`
  - includes reuse logic such as `canReuseSceneImage`, `sceneManifestPath`, `sceneOutputPath`, `loadReferenceImages`, `summarizeReferenceImages`
- `packages/image-generation/src/shorts-image-strategy.ts`
  - exports `ShortsImageStrategy`
  - exports `ShortsImageConfig`
  - exports `ShortsScenePlan`
  - exports `ShortsSceneManifestEntry`
  - exports `PreparedShortsImagesResult`
  - exports `ShortsImageAuditResult`
  - exports `loadCharacterRegistry`
  - exports `saveCharacterRegistry`
  - exports `buildShortsScenePlan`
  - exports `prepareShortsImages`
  - exports `auditShortsImages`

Tests already present:

- `packages/image-generation/src/openai-image.unit.test.ts`
- `packages/image-generation/src/index.integration.test.ts`

### CLI

Relevant CLI registration:

- `apps/cli/src/index.ts`
  - image commands are registered around the `images` command tree
  - observed commands:
    - `images plan`
    - `images generate`
    - `images generate-character-references`
    - `images approve-character`
    - `images regenerate-character`
    - `images export-openart`
    - `images open-openart`
    - `images import`
    - `images validate`
    - `images missing`
    - `images reject`
    - `images regenerate-workbook`
    - `images assign`
    - `images generate-openai`

### Translation batch infrastructure to reuse

Files and discovered exports:

- `packages/story-localization/src/story-localization-openai-batch.ts`
  - exports `OpenAiStoryClient`
  - exports `OpenAiBatchOutputLine`
  - exports `requireBatchCapabilities`
  - exports `createOpenAiStoryClient`
  - exports `normalizeBatchStatus`
  - exports `batchRequestCounts`
  - exports `readRemoteFileText`
  - exports `parseBatchOutputJsonl`
- `packages/story-localization/src/story-localization-batch-storage.ts`
  - exports `BatchStorageLayout`
  - exports `resolveBatchStorageRoot`
  - exports `resolveBatchStorageLayout`
  - exports `ensureBatchStorageLayout`
  - exports `toRepositoryRelativePath`
  - exports `fromRepositoryRelativePath`
  - exports `buildDeterministicCustomId`
  - exports `createLocalBatchId`
  - exports `manifestPathFor`
  - exports `inputPathFor`
  - exports `resultPathFor`
  - exports `errorPathFor`
  - exports `reportPathFor`
  - exports `serializeBatchRequestLines`
  - exports `writeBatchInputFile`
  - exports `writeLocalBatchManifest`
  - exports `saveLocalBatchManifest`
  - exports `readLocalBatchManifest`
  - exports `readLocalBatchManifestByPath`
  - exports `listManifestPaths`
  - exports `createBaseManifest`
  - exports `withFileLock`
- `packages/story-localization/src/story-localization-batch-index.ts`
  - exports `StoryBatchIndexService`
  - exports `entryFromLocalBatchManifest`
- `packages/story-localization/src/story-localization-batch-service.ts`
  - exports `prepareStoryLocalizationBatch`
  - exports `submitStoryLocalizationBatch`
  - exports `refreshStoryLocalizationBatch`
  - exports `importStoryLocalizationBatch`
  - exports `listStoryBatches`
  - exports `importReadyStoryBatches`
  - exports `refreshActiveStoryBatches`
  - exports `retryFailedStoryBatch`
  - exports `cancelStoryBatch`
  - exports `runStoryLocalizationInBatchMode`
- `packages/story-localization/src/index.ts`
  - re-exports the batch modules above
- `apps/cli/src/story-localization-commands.ts`
  - already provides batch lifecycle commands such as `stories:batches list`, `latest`, `pending`, `ready`, `completed`, `failed`, `expired`, `find`, `show`, `status`, `refresh`, `import`, `import-ready`, `retry-failed`, `cancel`, `verify-index`, and `rebuild-index`

## 4. Reuse/refactor decisions

| Subsystem | Discovered files | Current responsibility | Decision | Reason | Compatibility risk |
| --- | --- | --- | --- | --- | --- |
| OpenAI client | `packages/image-generation/src/openai-image.ts`, `packages/story-localization/src/story-localization-openai-batch.ts` | sync image calls and batch-capable client creation | `extend` | SDK already supports both sync and batch paths; reuse official client patterns | Low if request shapes stay versioned |
| Synchronous image generator | `packages/image-generation/src/openai-image.ts`, `packages/image-generation/src/episode-image-pipeline.ts` | immediate image generation, retries, validation, reuse checks | `reuse-unchanged` | Must preserve current production behavior | Low if batch is additive only |
| Image prompt loader | `packages/image-generation/src/episode-image-pipeline.ts` | scene prompt creation and loading | `extend` | Batch should consume validated persisted prompts, not regenerate them | Medium if prompt persistence is incomplete |
| Image output writer | `packages/image-generation/src/episode-image-pipeline.ts` | writes scene PNGs and manifests | `extend` | Needs atomic import from batch outputs and idempotent writes | Medium due to manifest updates |
| Image validator | `packages/image-generation/src/episode-image-pipeline.ts`, `packages/image-generation/src/openai-image.unit.test.ts` | validates generated images and reuse eligibility | `extend` | Batch import needs deterministic decode/dimension checks | Low |
| Image cost tracker | existing image pipeline and manifests | tracks usage/cost from sync generation | `extend` | Add batch cost reporting without breaking current accounting | Low |
| Batch JSONL writer | `packages/story-localization/src/story-localization-batch-storage.ts` | serializes JSONL batch inputs | `extend` | Same JSONL mechanics, new image request body shape | Low |
| Batch manifest service | `packages/story-localization/src/story-localization-batch-storage.ts` | local batch manifest persistence | `extend` | Reuse file layout, add image category and image item fields | Low |
| Batch index service | `packages/story-localization/src/story-localization-batch-index.ts` | shared index for batch lookup and lifecycle | `extend` | Avoid a second batch DB; add image category entries | Medium because of schema migration |
| Batch status service | `packages/story-localization/src/story-localization-batch-service.ts` | refresh/import/retry/cancel lifecycle | `extend` | Same lifecycle semantics apply to image batches | Low |
| Batch import service | `packages/story-localization/src/story-localization-batch-service.ts` and storage helpers | downloads outputs and imports results | `extend` | Need image decode, validation, atomic write, and partial success | Medium |
| Retry service | `packages/story-localization/src/story-localization-batch-service.ts` | retry failed text batches | `extend` | Retry only failed/expired/invalid image items | Medium |
| CLI | `apps/cli/src/index.ts`, `apps/cli/src/story-localization-commands.ts` | batch command entry points | `extend` | Add image batch commands under existing batch UX | Low |
| Episode manifest | image generation package and production manifests | scene-to-image mapping and render readiness | `extend` | Must record batch-imported images in the canonical episode manifest | Medium |
| Video rendering readiness checks | image generation package and render consumers | determines whether episode is ready | `extend` | Renderer must understand batch-imported scene images and pending batches | Medium |

## 5. Current synchronous image flow

Current behavior to preserve:

1. Episode/story code generates scene prompts synchronously.
2. `packages/image-generation/src/episode-image-pipeline.ts` plans scene jobs and determines reuse eligibility.
3. `packages/image-generation/src/openai-image.ts` uses the OpenAI Images API directly.
4. Output images are written to the current episode asset paths.
5. Scene manifests and episode readiness are updated synchronously.
6. Retry logic is scene-specific and keeps successful images unchanged.

The batch implementation must not remove or change this flow. Batch mode is an additional execution path.

## 6. Proposed batch image flow

Recommended lifecycle:

1. Load persisted, validated scene image prompts for English full-video episodes.
2. Build one `SceneImageJob` per prompt, skipping cached valid images.
3. Group compatible jobs by endpoint/model/request shape.
4. Emit one JSONL line per scene.
5. Persist a local batch manifest and update the shared batch index.
6. Upload the JSONL file as `purpose: 'batch'`.
7. Create a batch targeting `/v1/images/generations`.
8. Persist the OpenAI file ID and batch ID.
9. Exit by default without waiting.
10. Refresh status later.
11. Download output and error files when the batch completes.
12. Map results by `custom_id`.
13. Decode the returned base64 payload.
14. Validate and atomically write the image to the expected scene path.
15. Update the scene manifest, episode manifest, cost records, and batch index.
16. Retry only failed, expired, missing, invalid, or policy-adjusted items.

Batch mode must remain explicit. No implicit fallback to synchronous generation unless a caller passes an explicit `--fallback-to-sync`.

## 7. Endpoint and SDK capability findings

Confirmed on `openai@6.44.0`:

- File upload exists with batch purpose.
- Batch lifecycle methods exist.
- Batch file-content download exists.
- Sync image generation methods exist.
- Image batch requests can target `/v1/images/generations`.

Planned request body shape must be validated against the installed SDK types before implementation. The plan should not assume support for unsupported size, quality, or output-format parameters for the selected image model.

## 8. Data models and schema changes

Add typed batch/image models in the image package, aligned to existing batch conventions:

- `ImageProcessingMode = 'sync' | 'batch'`
- `BatchCategory = 'text-localization' | 'image-generation' | 'image-edit' | 'video-generation'`
- `ImageBatchStatus` and `ImageBatchItemStatus`
- `ImageBatchFailureClass`
- `ImageGenerationCostRecord`
- `ImageReadinessReport`
- `SceneImageJob`
- `ImageBatchManifest`
- `ImageBatchManifestItem`

Schema compatibility requirements:

- preserve old batch index reads
- version the shared batch index schema
- keep existing scene/image manifest fields readable
- store image-batch-specific fields as additive extensions

## 9. Shared batch-index changes

Do not create `image-batch-index.json`. Extend the existing shared index in `packages/story-localization/src/story-localization-batch-index.ts`.

Planned changes:

- add `image-generation` and `image-edit` categories to the index schema
- extend `StoryBatchIndexService` to index image batches without breaking text batch lookups
- include episode numbers, scene count, model, output format, and status counts for image entries
- add a backward-compatible schema migration path
- keep index updates atomic and lock-protected

Migration strategy:

- read old entries unchanged
- write the new schema version once the image category is introduced
- retain compatibility with existing batch command filters
- ensure rollback does not corrupt existing localization batches

## 10. Manifest changes

Local batch storage should remain under `./content-ideas/content/dark-truth-episodes/.batch/`.

Planned image batch files:

- `inputs/image-batch-<localBatchId>.jsonl`
- `manifests/image-batch-<localBatchId>.manifest.json`
- `results/image-batch-<localBatchId>.output.jsonl`
- `errors/image-batch-<localBatchId>.errors.jsonl`
- `reports/image-batch-<localBatchId>.summary.json`
- `locks/`

Manifest fields should record:

- local batch ID and parent lineage
- OpenAI input file ID
- OpenAI batch ID
- output and error file IDs
- endpoint
- model / quality / size / output format
- prompt and configuration hashes
- per-item `custom_id`
- per-item scene identifiers and expected output paths
- decode / validation / persistence status

## 11. JSONL request shape

Use one JSONL line per scene. Each line should be a standalone POST to `/v1/images/generations`.

Planned request envelope:

```ts
interface OpenAIImageBatchRequestLine {
  readonly custom_id: string;
  readonly method: 'POST';
  readonly url: '/v1/images/generations';
  readonly body: {
    readonly model: string;
    readonly prompt: string;
    readonly n: 1;
    readonly size: string;
    readonly quality?: string;
    readonly output_format?: 'png' | 'jpeg' | 'webp';
    readonly background?: 'transparent' | 'opaque' | 'auto';
    readonly moderation?: 'auto' | 'low';
    readonly user?: string;
  };
}
```

Implementation must verify the exact accepted fields for the selected model before writing request lines. Local metadata stays in the manifest, not in the API body.

## 12. Custom-ID strategy

Use deterministic, filesystem-safe custom IDs based on episode, language, format, scene, and hashes:

`dte-img:{episode}:{language}:{format}:{sceneId}:{promptHashPrefix}:{configHashPrefix}`

If retries are created, append a retry suffix such as `:r2`.

Requirements:

- unique within a batch
- deterministic for unchanged jobs
- no secrets
- order-independent
- authoritative mapping in the manifest

## 13. Result import and image decoding

Import should:

1. download completed output JSONL and error JSONL through the SDK
2. parse lines by `custom_id`
3. find the matching manifest item
4. locate image payloads safely
5. reject missing payloads
6. reject invalid base64
7. enforce a size ceiling before decoding
8. decode once
9. identify MIME type
10. compute SHA-256
11. validate dimensions
12. write atomically to the target scene path
13. update manifests only after write success

No base64 image data should be stored in logs or manifests.

## 14. Character-reference handling

The plan must preserve the current character-map behavior and the hard limit of three main characters per story.

Batch-mode routing should:

- keep scenes that rely on unsupported reference inputs on the synchronous path unless the SDK/API encoding is verified safe
- reuse existing character reference images when the selected image model and request shape support them
- avoid rerunning character extraction
- keep character identities and reference assets stable

If image-edit/reference batch encoding cannot be represented safely in JSONL, the plan should explicitly fall back to synchronous generation for those scenes only, not for the whole episode.

## 15. Image validation and persistence

Validation after import should verify:

- data exists
- payload decodes
- MIME type matches the output
- dimensions are valid
- aspect ratio tolerance is acceptable
- byte size is within min/max bounds
- output filename matches scene ID
- prompt/config hashes still match
- no successful existing image is overwritten without `--force`

Atomic persistence rules:

1. write temp file in destination directory
2. flush and close
3. validate temp file
4. rename atomically
5. update manifests after rename
6. remove temp files on failure where possible

## 16. Retry and policy-repair behavior

Retry only:

- failed
- expired
- missing result
- invalid base64
- decode failure
- invalid dimensions
- policy-adjusted scenes

Do not repeatedly retry authentication, billing, unsupported parameter, or deterministic configuration failures.

For policy rejections, preserve the original prompt hash, produce a minimally adjusted safe prompt, and retry once through a new child batch. Do not invent unrelated imagery.

## 17. Scene and episode manifest integration

Batch-imported images must still update the canonical production records used by renderers.

Plan to update:

- scene image path
- image hash
- dimensions and MIME type
- prompt hash
- config hash
- model / quality / size / output format
- generation mode (`sync` or `batch`)
- batch IDs and retry lineage
- cost records

Do not treat the batch manifest as the only durable production record.

## 18. Video render-readiness integration

Add readiness checks that report:

- expected scene count
- valid image count
- missing scenes
- failed scenes
- invalid scenes
- pending batch scenes
- stale scenes

The renderer must not silently proceed with missing batch-imported images unless the current pipeline already defines a fallback.

## 19. CLI changes

Extend existing image and batch commands instead of creating a separate UX.

Planned commands/options:

- `npm run stories:images -- --episode 002 --mode sync`
- `npm run stories:images -- --episode 002 --mode batch --prepare-batch`
- `npm run stories:images -- --episode 002 --mode batch --submit`
- `npm run stories:images -- --all --mode batch --submit`
- `npm run stories:images -- --episode 002 --scene scene-017 --mode sync --force`
- `npm run stories:batches -- status --batch <id>`
- `npm run stories:batches -- import --batch <id>`
- `npm run stories:batches -- import-ready --category image-generation`
- `npm run stories:batches -- retry-failed --batch <id>`

Preserve existing synchronous commands and their defaults.

## 20. Configuration changes

Planned env vars:

- `STORY_IMAGE_PROCESSING_MODE`
- `STORY_IMAGE_MODEL`
- `STORY_IMAGE_DRAFT_MODEL`
- `STORY_IMAGE_QUALITY`
- `STORY_IMAGE_OUTPUT_FORMAT`

Batch default policy:

- keep synchronous mode as the existing default for current commands
- require explicit batch mode for asynchronous image generation
- make any fallback to sync explicit

## 21. Cost tracking

Add per-scene and per-batch cost records for sync and batch runs.

Track:

- model
- quality
- size
- output format
- mode
- local batch ID
- OpenAI batch ID
- custom ID
- estimated cost
- pricing-known flag
- attempt count

Do not guess costs when pricing is unavailable.

## 22. Locking and idempotency

Reuse `withFileLock` and the current batch lock patterns.

Planned locks:

- one lock per local batch during submission
- one lock per local batch during import
- one lock per episode manifest during updates
- one shared index lock

Idempotency requirements:

- repeated import must not rewrite valid unchanged images
- duplicate submission must be detected
- stale lock recovery must be safe
- repeated status refresh must be harmless

## 23. Migration strategy

Backward-compatible migration must cover:

- existing scene prompt data
- existing generated images
- existing episode manifests
- existing image cost records
- existing batch index entries
- existing CLI behavior
- existing synchronous retries

Rules:

- do not regenerate all existing images
- do not invalidate valid existing images when batch support is added
- do not create a second image-batch database
- add schema versions with read compatibility

## 24. Security considerations

Required safeguards:

- no API keys in JSONL
- no secrets in custom IDs
- no base64 in logs
- no base64 in manifests
- no path traversal
- validated repository-relative paths
- atomic writes
- size limits before decode
- bounded decode concurrency
- lock-protected batch/episode updates
- no implicit charges during dry run
- explicit `--submit`

## 25. Phased implementation tasks

### Phase 1 — Repository discovery and compatibility design

Objective:

- formalize the current sync image path and batch infrastructure
- confirm SDK capabilities and exact response shapes
- decide which modules are reused, extended, or refactored

Exact files to add/modify:

- plan document only in this phase

Dependencies:

- none

Completion criteria:

- approved plan with concrete file-level implementation map

### Phase 2 — Shared types and index migration

Objective:

- introduce image batch types and schema versions
- extend the shared batch index for image categories

Files likely to modify:

- `packages/story-localization/src/story-localization-batch-index.ts`
- `packages/story-localization/src/story-localization-batch-storage.ts`
- `packages/image-generation/src/*` new image-batch types module

Tests:

- index migration
- category filtering
- manifest read compatibility

### Phase 3 — Image batch planning and JSONL

Objective:

- load persisted prompts
- build jobs
- skip cached valid images
- write JSONL
- compute custom IDs and hashes

Files likely to modify:

- `packages/image-generation/src/episode-image-pipeline.ts`
- new image-batch planner/request-builder module

Tests:

- one job per prompt
- deterministic custom IDs
- JSONL line shape
- endpoint correctness

### Phase 4 — Submission and lifecycle

Objective:

- upload JSONL
- create image batch
- persist remote IDs
- refresh status
- update index

Files likely to modify:

- `packages/image-generation/src/*batch*`
- `packages/story-localization/src/story-localization-openai-batch.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`

Tests:

- submit
- status refresh
- cancel / retry / recovery compatibility

### Phase 5 — Result import

Objective:

- download outputs
- decode base64
- validate and atomically persist images
- update manifests

Files likely to modify:

- new import/decoder service in image package
- existing output writer / validator modules

Tests:

- valid import
- invalid base64
- invalid dimensions
- partial success
- idempotent re-import

### Phase 5 completed

Completed work:

- Added `importImageBatch` to download completed batch outputs and error files, map results by `custom_id`, and persist imported images.
- Decoded base64 payloads with validation and validated the resulting image format and dimensions before writing.
- Updated the scene manifest for each imported image with `generatedAt`, `outputSha256`, and a generated status.
- Wrote batch result, error, and summary artifacts atomically alongside the existing manifest files.
- Kept synchronous image generation unchanged and left the planner/submission flow intact.

Decisions:

- Treat missing batch lines as retry-required rather than silently dropping them.
- Classify explicit OpenAI batch errors as policy-rejected, expired, or api-failed based on the remote error code.
- Persist both the imported image file and the updated scene manifest in the import report for traceability.
- Validate decoded image dimensions before the atomic write so malformed payloads never leave a wrong-size file behind.

Changed files:

- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`

Validation:

- `./node_modules/.bin/tsc -p packages/image-generation/tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run packages/image-generation/src/image-batch-planner.unit.test.ts packages/image-generation/src/image-batch-service.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/shorts-image-strategy.unit.test.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Remaining tasks:

- add retry and partial-failure handling for eligible image items
- wire render-readiness and CLI reporting to the new import state
- harden end-to-end recovery flows and duplicate submission prevention

### Phase 6 completed

Completed work:

- Added `retryFailedImageBatch` to rebuild a new image batch from only the retryable scenes in a failed or partially failed batch.
- Reused the existing scene prompt and manifest loading path so retry batches stay aligned with the original episode inputs.
- Preserved batch lineage by copying the original root batch id, setting the parent batch id, and incrementing the retry number.
- Normalized persisted image quality back to the planner’s strict quality union before creating the retry batch.
- Kept successful scenes out of the retry batch and left synchronous image generation unchanged.

Decisions:

- Treat retryable image statuses as `api-failed`, `expired`, `policy-rejected`, `decode-failed`, `validation-failed`, and `retry-required`.
- Derive the retry batch from the stored scene manifests and prompt files instead of duplicating prompt-generation logic.
- Allow retry planning to proceed even if the batch has not yet been indexed, because the manifest on disk is the source of truth for this step.

Changed files:

- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`

Validation:

- `./node_modules/.bin/tsc -p packages/image-generation/tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run packages/image-generation/src/image-batch-planner.unit.test.ts packages/image-generation/src/image-batch-service.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/shorts-image-strategy.unit.test.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Remaining tasks:

- wire render-readiness and CLI reporting to the new batch state
- add duplicate-submission prevention and recovery hardening around repeated retries

### Phase 7 completed

Completed work:

- Added `summarizeImageBatchState` to report image batch readiness, pending work, and imported/failed counts from the shared batch index.
- Kept render-readiness reporting aligned with the category-aware shared batch index so image batches appear in the same operational views as text batches.
- Confirmed the existing `stories:batches ready` and related batch utilities can surface image-generation entries without a separate parallel reporting store.
- Preserved the synchronous image-generation path and batch lifecycle behavior unchanged.

Decisions:

- Reuse the shared batch index as the source of truth for readiness and reporting rather than introducing a second image-only reporting database.
- Keep render/reporting logic read-only so it cannot mutate production batch state.
- Treat a batch set as render-ready only when there are no pending batches, no batches requiring import, and no failed batches.

Changed files:

- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`

Validation:

- `./node_modules/.bin/tsc -p packages/image-generation/tsconfig.json --noEmit`
- `./node_modules/.bin/vitest run packages/image-generation/src/image-batch-planner.unit.test.ts packages/image-generation/src/image-batch-service.unit.test.ts packages/image-generation/src/openai-image.unit.test.ts packages/image-generation/src/shorts-image-strategy.unit.test.ts packages/image-generation/src/episode-image-pipeline.unit.test.ts`

Remaining tasks:

- run the broader repository test sweep for any unrelated regressions
- document any operational notes that fall out of the full suite
- keep duplicate-submission and repeated-retry safeguards under observation
- finish any remaining phase-specific documentation and verify the shared index behavior end to end

### Phase 6 — Retry and partial failure

Objective:

- classify failures
- retry only eligible items
- preserve successful images
- support policy repair

Files likely to modify:

- new retry planner in image package
- batch service retry hooks

Tests:

- retry selection
- successful scene exclusion
- policy repair cap

### Phase 7 — Render integration and reporting

Objective:

- readiness checks
- batch-aware episode state
- cost reports
- summaries

Files likely to modify:

- episode manifest / render readiness code
- CLI reporting

Tests:

- readiness report
- render blocked on missing images
- completed episode ready state

### Phase 8 — Tests and hardening

Objective:

- unit tests
- integration tests
- lint
- typecheck
- docs

Completion criteria:

- all tests pass
- no regression in synchronous image generation
- no unhandled batch path for valid scenes

## 26. Unit-test plan

Add or extend tests for:

1. sync behavior remains unchanged
2. batch-mode option parsing
3. prompt loading
4. one job per prompt
5. deterministic custom IDs
6. duplicate custom-ID rejection
7. prompt hash calculation
8. configuration hash calculation
9. valid existing image skipping
10. stale image selection
11. invalid image selection
12. unsupported model rejection
13. unsupported size rejection
14. unsupported quality rejection
15. JSONL generation
16. one request per line
17. `n=1`
18. correct endpoint
19. no local metadata in API body
20. manifest creation
21. shared index extension
22. old index migration
23. result mapping by custom ID
24. output-order independence
25. valid base64 decoding
26. invalid base64 rejection
27. MIME validation
28. dimension validation
29. atomic image persistence
30. successful image preservation
31. partial success handling
32. retry selection
33. successful scene exclusion from retry
34. policy rejection classification
35. safe prompt-repair limit
36. cost aggregation
37. render-readiness report
38. import concurrency limit
39. idempotent import
40. duplicate submission prevention

## 27. Integration-test plan

Use mocked OpenAI clients only. Cover:

1. prepare one episode batch
2. prepare multiple episodes
3. upload JSONL
4. create image batch
5. persist local and OpenAI IDs
6. shared index entry creation
7. status refresh
8. completed output download
9. error output download
10. result order different from input
11. successful base64 image import
12. multiple successful image imports
13. one failed scene with others succeeding
14. failed scene retry only
15. expired batch partial import
16. missing result handling
17. invalid base64 handling
18. image decode failure
19. invalid dimensions
20. existing valid image skip
21. forced regeneration
22. synchronous one-scene generation
23. no automatic sync fallback
24. explicit sync fallback
25. character-reference-dependent scene routing
26. unsupported reference request remains synchronous
27. policy-repaired retry
28. no infinite retry
29. episode manifest updates
30. render readiness after complete import
31. render blocked with missing images
32. dry run makes no API requests
33. validate-only makes no API requests
34. repeated import is idempotent
35. machine restart followed by status and import
36. index rebuild includes image batches
37. cleanup preserves production images
38. cost report includes batch versus sync comparison

## 28. Validation commands

Planned commands to run after implementation:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test --filter image-generation`
- `pnpm test --filter story-localization`
- `npm run stories:images -- --episode 002 --mode batch --dry-run`
- `npm run stories:batches -- list --category image-generation`

## 29. Risks and mitigations

- SDK request-shape mismatch: verify installed `openai@6.44.0` types before writing JSONL.
- Reference-image encoding may not fit batch JSONL safely: preserve synchronous fallback for those scenes only.
- Shared batch index migration could affect translation batches: keep schema additive and backward-compatible.
- Import failures could partially corrupt output: use atomic writes and idempotent manifest updates.
- Cost tracking may be incomplete if pricing is unknown: report tokens and omit guessed costs.
- Renderer may expect synchronous-only state: update readiness checks conservatively and preserve current consumers.

## 30. Open questions and assumptions

Resolved by repository inspection:

- SDK version is `openai@6.44.0`
- image batch endpoint support exists for `/v1/images/generations`
- sync path already exists and must be preserved
- translation batch infrastructure already provides reusable storage/index/service patterns

Still to confirm during implementation:

- exact image result payload shape for the selected OpenAI model in batch mode
- whether any current scenes require reference-image inputs that must remain synchronous
- whether existing image manifests already encode enough information for batch import without extension

Assumption:

- English full-video scene prompts are the initial batch source, and batch support will be added first for that canonical workflow.

## 31. Definition of done

This work is done when:

- synchronous image generation continues to work unchanged
- batch image generation can prepare, submit, refresh, import, and retry `/v1/images/generations` jobs
- imported results are mapped by `custom_id`
- images are validated and written atomically
- successful existing images remain unchanged
- the shared batch index supports image categories
- the CLI exposes image batch lifecycle operations
- the renderer can report readiness accurately
- unit and integration tests cover the new batch workflow
- the plan remains compatible with the current translation batch architecture
