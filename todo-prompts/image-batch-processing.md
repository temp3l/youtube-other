create a new branch for the following:

You are working inside an existing TypeScript/Node.js repository that produces multilingual narrated horror videos.

The repository already contains implementation related to:

- English full-story processing;
- scene extraction;
- scene timestamps;
- scene-level image prompts;
- synchronous OpenAI image generation;
- generated image storage;
- image retries;
- image cost tracking;
- character extraction;
- a hard maximum of three main characters per story;
- character maps;
- character reference images;
- thumbnail prompts;
- translation Batch API processing;
- batch manifests;
- a central batch index;
- batch lookup, status, import, retry, and recovery commands;
- video rendering.

Your task in this first step is to inspect the repository and create a detailed implementation plan for adding asynchronous OpenAI image Batch API processing.

Do not modify production code during this planning step.

Do not remove or replace the existing synchronous image-generation mechanism.

The future implementation must add image batch processing alongside synchronous image generation and reuse the existing batch infrastructure wherever technically reasonable.

# Planning deliverable

Save the complete implementation plan to:

```text
docs/plans/story-image-batch-processing.md
```

Create the parent directory if necessary.

The plan must be concrete enough that another Codex session can implement it without repeating repository discovery.

Do not implement production code yet.

You may create only the planning document in this step.

# Primary objective

When the English full-video pipeline creates scene-level image prompts, the system must be able to:

1. collect validated image prompts for an episode;
2. convert each prompt into an independent OpenAI Batch API request;
3. write a valid JSONL input file;
4. upload it using the official OpenAI Node.js SDK;
5. create a batch targeting:

```text
/v1/images/generations
```

6. persist all local and remote batch identifiers;
7. exit without waiting by default;
8. retrieve status later;
9. download completed batch output and error files;
10. match each result by `custom_id`;
11. decode returned base64 image data;
12. validate and store each image in its expected scene path;
13. update episode and batch manifests;
14. retry only failed, expired, missing, or invalid scenes;
15. keep successful images unchanged;
16. preserve the current synchronous image-generation path.

# Mandatory repository inspection

Before writing the plan, inspect the repository for existing code related to:

```text
image generation
image prompts
scene prompts
scene images
generated-assets
gpt-image
images.generate
images.edit
OpenAI images
image retries
image cost
image manifest
scene manifest
episode manifest
batch
batch-index
batch manifest
JSONL
custom_id
translation batch
result import
retry-failed
character map
character references
visual identity
thumbnail generation
video rendering
render prerequisites
```

Inspect at minimum:

- package manager and workspace structure;
- CLI entry points;
- OpenAI SDK version;
- OpenAI client abstraction;
- synchronous image-generation service;
- image prompt schemas;
- scene schemas;
- scene ID and filename conventions;
- episode output layout;
- existing character-reference support;
- image model configuration;
- size, quality, and output-format handling;
- retry classification;
- cost logging;
- API usage logging;
- translation batch infrastructure;
- batch index implementation;
- batch manifest implementation;
- batch locking;
- batch import implementation;
- batch cleanup implementation;
- video-render prerequisites;
- tests around image generation and batching.

Record exact discovered file paths and exported symbols in the plan.

# Existing implementation decision

The plan must explicitly classify each relevant existing subsystem as:

```ts
type ReuseDecision = "reuse-unchanged" | "extend" | "refactor" | "replace";
```

For every subsystem, document:

- discovered files;
- current responsibility;
- decision;
- reason;
- compatibility risks;
- proposed changes.

Subsystems must include:

- OpenAI client;
- synchronous image generator;
- image prompt loader;
- image output writer;
- image validator;
- image cost tracker;
- batch JSONL writer;
- batch manifest service;
- batch index service;
- batch status service;
- batch import service;
- retry service;
- CLI;
- episode manifest;
- video rendering readiness checks.

Use `replace` only when reuse or refactoring is not technically viable.

# Non-negotiable compatibility requirements

The future implementation must:

- preserve the current synchronous image-generation mechanism;
- preserve existing synchronous CLI commands;
- preserve existing image filenames where valid;
- preserve existing episode output paths;
- preserve existing character-map behavior;
- preserve the hard maximum of three main characters;
- preserve existing scene-to-image mapping;
- preserve existing video-render consumers;
- avoid regenerating successful unchanged images;
- avoid introducing a second independent batch index;
- reuse the translation batch index where possible;
- reuse batch locks, lifecycle states, and lookup commands where possible;
- use the official OpenAI Node.js SDK;
- never use shell-based `curl`.

# Processing modes

Plan for:

```ts
type ImageProcessingMode = "sync" | "batch";
```

Recommended behavior:

## Synchronous mode

Use for:

- development;
- one-scene preview;
- urgent generation;
- prompt debugging;
- targeted retry;
- image edits;
- character-reference experimentation;
- explicit immediate execution.

## Batch mode

Use for:

- all scene images for an episode;
- multiple episodes;
- normal production runs;
- non-urgent regeneration;
- large multilingual or channel-wide image production.

Do not remove synchronous mode.

Do not silently fall back from batch to synchronous mode.

Any fallback must require an explicit option such as:

```text
--fallback-to-sync
```

# OpenAI endpoint

The image batch must target:

```text
/v1/images/generations
```

Each JSONL line must represent one independent image-generation request.

Do not use `/v1/responses` merely to invoke an image tool when the direct image-generation batch endpoint supports the required operation.

The plan must verify the installed OpenAI SDK’s exact TypeScript API and types for:

- file upload with purpose `batch`;
- batch creation;
- batch retrieval;
- batch cancellation;
- file-content download;
- synchronous image generation;
- image batch request bodies.

Do not assume SDK method names without checking the installed version.

# One image prompt per batch item

Use one scene image per batch item.

Do not bundle multiple unrelated scene prompts into one request body.

Benefits that the plan must preserve:

- independent scene tracking;
- independent validation;
- independent retry;
- deterministic filenames;
- partial success;
- exact cost attribution;
- no need to regenerate successful scenes.

A single episode batch may contain many request lines, but each request line should normally use:

```text
n = 1
```

# Prompt source

Batch generation must consume existing persisted, validated scene image prompts.

Do not regenerate scene prompts merely because batch generation was requested.

The plan must identify the existing prompt source and document:

- prompt file path;
- prompt schema;
- scene ID field;
- episode ID field;
- language field;
- timestamp or timeline range;
- character IDs;
- reference-image dependencies;
- model;
- requested dimensions;
- quality;
- output format;
- expected image path;
- prompt hash;
- generation configuration hash.

If the current implementation stores prompts only in memory, plan a backward-compatible persisted prompt manifest before batching.

# Canonical source and language

The English full-video image prompts are the initial source for this batch workflow.

The implementation should initially support:

```text
English full-video scene prompts
```

Design the types so other languages and Shorts can be added later without changing the batch core.

Do not automatically include:

- translated full-video prompts;
- Short prompts;
- thumbnail prompts;
- character reference prompts;

unless explicitly requested by a future CLI option and supported by the existing architecture.

# Scene image job model

Plan an effective type similar to:

```ts
interface SceneImageJob {
  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: "en";
  readonly format: "full";

  readonly sceneId: string;
  readonly sceneIndex: number;

  readonly startTimeSeconds?: number;
  readonly endTimeSeconds?: number;

  readonly promptPath?: string;
  readonly positivePrompt: string;
  readonly negativePrompt?: string;

  readonly characterIds: readonly string[];
  readonly characterReferencePaths: readonly string[];

  readonly model: string;
  readonly quality: string;
  readonly requestedSize: string;
  readonly outputFormat: "png" | "jpeg" | "webp";

  readonly expectedOutputPath: string;

  readonly promptHash: string;
  readonly generationConfigurationHash: string;
}
```

Adapt this to existing repository types rather than introducing duplicate scene definitions.

# Character limit

Reuse the existing character implementation.

Continue enforcing:

```ts
export const MAX_MAIN_CHARACTERS_PER_STORY = 3 as const;
```

This limit applies to the episode character map.

Individual scene prompts should include only characters actually visible in that scene.

The batch workflow must not:

- rerun character extraction;
- invent characters;
- exceed the active episode character map;
- use translated character maps;
- create language-specific character identities.

The plan must document how character-reference image dependencies interact with image batching.

# Important limitation: image references

Inspect whether the existing synchronous image path uses:

- text-only generation;
- image inputs;
- image edits;
- character reference images;
- the Image API edit endpoint;
- the Responses API image tool.

The Batch API supports both image generations and image edits, but they use different endpoints and request shapes.

The plan must not assume that text-to-image generation and reference-conditioned image editing can share the same batch.

If scenes require input/reference images, plan separate compatible batch groups such as:

```text
/v1/images/generations
/v1/images/edits
```

However, confirm whether the installed SDK and current API request encoding can represent image-edit inputs in batch JSONL without unsafe or unsupported local-file references.

A local file path cannot be sent directly to OpenAI inside batch JSONL.

The plan must determine whether reference images require:

- uploaded file IDs;
- data URLs;
- base64 input;
- multipart handling;
- a separate synchronous path;
- or a separate edits batch.

Until verified, preserve synchronous generation as the fallback for scenes requiring unsupported reference inputs.

# Suggested custom ID

Plan deterministic custom IDs such as:

```text
dte-img:{episode}:{language}:{format}:{sceneId}:{promptHashPrefix}:{configHashPrefix}
```

Example:

```text
dte-img:002:en:full:scene-017:a91f06d2:05ca10b8
```

Requirements:

- unique within a batch;
- deterministic for unchanged jobs;
- no secrets;
- filesystem-safe;
- independent of output ordering;
- mapped authoritatively through a manifest;
- attempt suffix for forced regeneration or retries.

Retry example:

```text
dte-img:002:en:full:scene-017:a91f06d2:05ca10b8:r2
```

# JSONL request design

Plan one JSONL line per scene.

The effective line should resemble:

```ts
interface OpenAIImageBatchRequestLine {
  readonly custom_id: string;
  readonly method: "POST";
  readonly url: "/v1/images/generations";
  readonly body: {
    readonly model: string;
    readonly prompt: string;
    readonly n: 1;
    readonly size: string;
    readonly quality?: string;
    readonly output_format?: "png" | "jpeg" | "webp";
    readonly background?: "transparent" | "opaque" | "auto";
    readonly moderation?: "auto" | "low";
    readonly user?: string;
  };
}
```

The planning document must verify exact accepted fields against:

- the installed SDK types;
- the current OpenAI API;
- the selected image model.

Do not send unsupported properties.

Do not include local metadata in the API request body.

Keep local metadata in the batch manifest.

# Model capability mapping

Plan to reuse or add a typed model-capability registry.

It should cover:

```ts
interface ImageModelCapabilities {
  readonly model: string;
  readonly supportedEndpoints: readonly (
    | "/v1/images/generations"
    | "/v1/images/edits"
  )[];

  readonly supportedSizes: readonly string[];
  readonly supportsArbitrarySizes: boolean;
  readonly supportsInputImages: boolean;
  readonly supportedQualityValues: readonly string[];
  readonly supportedOutputFormats: readonly string[];
  readonly supportsTransparency: boolean;
  readonly maximumImagesPerRequest: number;
}
```

The plan must identify whether such capability logic already exists and how to extend it.

Never silently send unsupported model parameters.

# Recommended default model strategy

Plan configurable model selection.

Recommended production policy:

- use the existing configured image model by default;
- optionally support a lower-cost draft model;
- do not hardcode a model without respecting current repository configuration;
- record the exact model on every job and result;
- prevent a batch from mixing incompatible request shapes;
- group jobs by endpoint and model when required.

Suggested configuration:

```text
STORY_IMAGE_PROCESSING_MODE=batch
STORY_IMAGE_MODEL=
STORY_IMAGE_DRAFT_MODEL=
STORY_IMAGE_QUALITY=
STORY_IMAGE_OUTPUT_FORMAT=
```

# Image batch storage

Reuse the existing central batch root and batch index where possible.

Do not create a completely independent image batch database.

The plan should prefer a structure such as:

```text
./content-ideas/content/dark-truth-episodes/.batch/
  batch-index.json

  inputs/
    image-batch-<localBatchId>.jsonl

  manifests/
    image-batch-<localBatchId>.manifest.json

  results/
    image-batch-<localBatchId>.output.jsonl

  errors/
    image-batch-<localBatchId>.errors.jsonl

  reports/
    image-batch-<localBatchId>.summary.json

  locks/
```

If the existing translation batch directories differ, document how to extend them without breaking current behavior.

# Shared batch index

Extend the existing batch index rather than creating `image-batch-index.json`.

Plan a batch category:

```ts
type BatchCategory =
  | "text-localization"
  | "image-generation"
  | "image-edit"
  | "video-generation";
```

An image batch index entry should include:

```ts
interface ImageBatchIndexDetails {
  readonly category: "image-generation";

  readonly episodeNumbers: readonly string[];
  readonly sceneCount: number;

  readonly imageModel: string;
  readonly imageQuality?: string;
  readonly outputFormat: string;

  readonly generatedImageCount: number;
  readonly invalidImageCount: number;
  readonly failedImageCount: number;
  readonly missingImageCount: number;

  readonly requiresImport: boolean;
}
```

Adapt the existing index schema through versioned backward-compatible migration.

The plan must document:

- old index schema version;
- new schema version;
- migration strategy;
- read compatibility;
- atomic migration;
- rollback risk.

# Image batch manifest

Plan a manifest similar to:

```ts
interface ImageBatchManifest {
  readonly schemaVersion: string;
  readonly category: "image-generation";

  readonly localBatchId: string;
  readonly rootLocalBatchId: string;
  readonly parentLocalBatchId?: string;
  readonly retryNumber: number;

  readonly createdAt: string;
  readonly updatedAt: string;

  readonly endpoint: "/v1/images/generations";
  readonly model: string;
  readonly completionWindow: "24h";

  readonly inputFilePath: string;
  readonly inputFileHash: string;

  readonly openAIInputFileId?: string;
  readonly openAIBatchId?: string;
  readonly outputFileId?: string;
  readonly errorFileId?: string;

  readonly status: ImageBatchStatus;

  readonly items: readonly ImageBatchManifestItem[];

  readonly resultFilePath?: string;
  readonly errorFilePath?: string;
  readonly reportFilePath?: string;

  readonly submittedAt?: string;
  readonly completedAt?: string;
  readonly importedAt?: string;
}
```

Plan item details:

```ts
interface ImageBatchManifestItem {
  readonly customId: string;

  readonly episodeNumber: string;
  readonly episodeSlug: string;
  readonly language: "en";
  readonly format: "full";

  readonly sceneId: string;
  readonly sceneIndex: number;

  readonly promptHash: string;
  readonly generationConfigurationHash: string;

  readonly expectedOutputPath: string;

  readonly characterIds: readonly string[];
  readonly characterReferenceHashes: readonly string[];

  readonly requestedSize: string;
  readonly quality?: string;
  readonly outputFormat: "png" | "jpeg" | "webp";

  readonly status: ImageBatchItemStatus;

  readonly imageHash?: string;
  readonly actualWidth?: number;
  readonly actualHeight?: number;
  readonly actualMimeType?: string;
  readonly actualByteSize?: number;

  readonly usage?: ImageUsageRecord;
  readonly estimatedCostUsd?: number;

  readonly error?: {
    readonly category: string;
    readonly code?: string;
    readonly message: string;
  };
}
```

# Lifecycle

Plan these explicit phases:

## 1. Prompt readiness

```text
English full story
→ scene/timestamp generation
→ image prompt generation
→ prompt validation
→ prompt persistence
```

## 2. Batch preparation

```text
load persisted prompts
→ resolve scene jobs
→ skip cached valid images
→ verify dependencies
→ group compatible jobs
→ create custom IDs
→ write JSONL
→ write manifest
→ update shared batch index
```

## 3. Submission

```text
verify manifest and JSONL hash
→ upload JSONL using purpose=batch
→ create /v1/images/generations batch
→ persist OpenAI file and batch IDs
→ update manifest and index
→ print next commands
→ exit
```

## 4. Status refresh

```text
resolve local or OpenAI batch ID
→ retrieve remote status
→ persist status and request counts
→ update index
```

## 5. Import

```text
download output JSONL
→ download error JSONL
→ map by custom_id
→ extract base64 image result
→ decode bytes
→ validate image
→ write image atomically
→ update scene manifest
→ update episode manifest
→ update image batch manifest
→ update batch index
→ write cost report
```

## 6. Retry

```text
select only failed, expired, missing, invalid, or policy-adjusted jobs
→ preserve successful files
→ create child batch
→ persist lineage
→ submit only eligible jobs
```

# No long-running CLI by default

The planning document must preserve asynchronous operation.

Default behavior:

```text
prepare
→ submit
→ persist IDs
→ exit
```

Do not keep a CLI process alive for up to 24 hours by default.

Optional flags may include:

```text
--wait
--auto-import
--poll-interval-seconds
```

# Proposed CLI behavior

Inspect and adapt existing commands.

Plan commands similar to:

## Existing synchronous generation

```bash
npm run stories:images -- \
  --episode 002 \
  --mode sync
```

This must continue to work.

## Prepare image batch only

```bash
npm run stories:images -- \
  --episode 002 \
  --language en \
  --format full \
  --mode batch \
  --prepare-batch
```

## Prepare and submit

```bash
npm run stories:images -- \
  --episode 002 \
  --language en \
  --format full \
  --mode batch \
  --submit
```

## Multiple episodes

```bash
npm run stories:images -- \
  --all \
  --language en \
  --format full \
  --mode batch \
  --submit
```

## Selected scenes

```bash
npm run stories:images -- \
  --episode 002 \
  --scenes scene-001,scene-002,scene-017 \
  --mode batch \
  --submit
```

## Scene range

```bash
npm run stories:images -- \
  --episode 002 \
  --scene-from 10 \
  --scene-to 25 \
  --mode batch \
  --submit
```

## Status

```bash
npm run stories:batches -- \
  status \
  --batch <local-or-openai-batch-id>
```

## Import

```bash
npm run stories:batches -- \
  import \
  --batch <local-or-openai-batch-id>
```

## Import all ready batches

```bash
npm run stories:batches -- \
  import-ready \
  --category image-generation
```

## Retry failed images

```bash
npm run stories:batches -- \
  retry-failed \
  --batch <local-or-openai-batch-id>
```

## Generate one failed scene synchronously

```bash
npm run stories:images -- \
  --episode 002 \
  --scene scene-017 \
  --mode sync \
  --force
```

## Dry run

```bash
npm run stories:images -- \
  --episode 002 \
  --mode batch \
  --dry-run
```

# Proposed CLI options

Plan support for:

```text
--all
--episode <number-or-slug>
--language en
--format full

--scene <scene-id>
--scenes <comma-separated-scene-ids>
--scene-from <index>
--scene-to <index>

--mode sync|batch
--prepare-batch
--submit
--wait
--auto-import
--fallback-to-sync

--model <image-model>
--quality <quality>
--size <width>x<height>
--output-format png|jpeg|webp

--force
--retry-failed
--regenerate-invalid
--skip-existing
--dry-run
--validate-only
--verbose
```

Defaults should preserve current behavior unless the existing project already establishes batch as a production default.

The planning document must recommend whether:

```text
mode=sync
```

or:

```text
mode=batch
```

should remain the global default, based on current pipeline expectations.

Recommended policy:

- retain synchronous mode as the default for existing commands to avoid surprising behavior;
- add an explicit production alias that defaults to batch;
- or migrate to batch default only if the current text-batch pipeline has already established that convention.

# Result decoding

GPT Image results may contain base64-encoded image data.

The plan must identify the exact result response shape for the chosen model and endpoint.

Plan a decoder that:

- locates the image payload safely;
- rejects missing data;
- rejects invalid base64;
- enforces a maximum decoded size;
- identifies MIME type;
- decodes once;
- computes SHA-256;
- validates dimensions;
- writes atomically;
- never logs base64 content;
- clears large buffers promptly where practical.

Do not store base64 image data in manifests.

# Image validation

Plan deterministic validation after import:

- data exists;
- base64 is valid;
- image decodes;
- MIME type matches expected format;
- dimensions are valid;
- aspect ratio matches expected tolerance;
- byte size exceeds a minimum threshold;
- byte size remains below a configured maximum;
- image is not identical to a known placeholder;
- output filename matches scene ID;
- no successful scene is overwritten without `--force`;
- image hash is persisted;
- prompt and configuration hashes still match.

Reuse existing image validation where possible.

# Atomic persistence

Plan atomic image writes:

1. decode to a temporary file in the destination directory;
2. validate temporary image;
3. flush and close;
4. rename to final path;
5. update manifests only after rename succeeds;
6. remove temporary files after failure.

Never write decoded image bytes directly over a valid existing image.

# Existing image handling

Before creating batch items:

- check whether expected output exists;
- validate existing image;
- compare prompt hash;
- compare configuration hash;
- compare character reference hashes;
- compare model and quality;
- skip unchanged valid images;
- schedule stale or invalid images only when requested.

Do not submit cached images.

If every selected image already exists and is valid:

- create no batch;
- return a successful no-op summary.

# Scene and episode manifests

Inspect current scene and episode manifests.

The plan must document how imported images update:

- scene status;
- image path;
- prompt hash;
- model;
- quality;
- dimensions;
- MIME type;
- image hash;
- generation mode;
- local batch ID;
- OpenAI batch ID;
- retry count;
- cost;
- generation timestamp.

Avoid treating the batch manifest as the only production record.

The episode’s canonical production manifest should still know which image belongs to each scene.

# Video render readiness

Plan a readiness service that verifies the required image set before rendering.

It should report:

```ts
interface ImageReadinessReport {
  readonly ready: boolean;
  readonly expectedSceneCount: number;
  readonly validImageCount: number;
  readonly missingSceneIds: readonly string[];
  readonly failedSceneIds: readonly string[];
  readonly invalidSceneIds: readonly string[];
  readonly pendingBatchSceneIds: readonly string[];
  readonly staleSceneIds: readonly string[];
}
```

The renderer must not silently proceed with missing scenes unless the existing pipeline explicitly supports fallback images.

If fallback behavior exists, document it and preserve it.

# Partial success

Batch import must persist successful images even when other scenes fail.

Do not roll back an entire episode because one image failed.

After import, classify each scene as:

```ts
type ImageBatchItemStatus =
  | "planned"
  | "submitted"
  | "api-succeeded"
  | "api-failed"
  | "expired"
  | "policy-rejected"
  | "decode-failed"
  | "validation-failed"
  | "persisted"
  | "skipped-cached"
  | "retry-required";
```

# Failure classification

Plan typed failure categories:

```ts
type ImageBatchFailureClass =
  | "transient"
  | "rate-limit"
  | "expired"
  | "authentication"
  | "billing"
  | "configuration"
  | "unsupported-parameter"
  | "policy"
  | "missing-result"
  | "invalid-base64"
  | "decode"
  | "dimension"
  | "filesystem"
  | "unknown";
```

Retry automatically only when appropriate.

Do not repeatedly retry:

- authentication failures;
- billing failures;
- invalid model configuration;
- unsupported size;
- unsupported quality;
- deterministic policy rejection;
- missing prompt source.

# Policy rejection handling

Horror prompts may trigger image safety policies.

The plan must reuse existing safe prompt-repair behavior if present.

Recommended workflow:

1. record the rejected original prompt hash;
2. classify the rejected visual elements;
3. create a minimally adjusted safe prompt;
4. preserve story identity;
5. remove explicit gore rather than changing the entire scene;
6. generate a new prompt hash;
7. submit one retry;
8. preserve audit history;
9. never retry indefinitely.

Do not silently replace rejected scenes with unrelated imagery.

# Retry lineage

Reuse existing parent-child batch lineage.

A retry batch should include only:

- API failures;
- expired items;
- missing result items;
- invalid base64;
- failed decode;
- invalid dimensions;
- explicitly selected stale images;
- safely repaired policy prompts.

Successful persisted scenes must not be included.

# Cost tracking

Inspect existing image cost tracking.

Plan per-scene and per-batch usage records.

Each scene should record:

```ts
interface ImageGenerationCostRecord {
  readonly episodeNumber: string;
  readonly sceneId: string;

  readonly mode: "sync" | "batch";
  readonly model: string;
  readonly quality?: string;
  readonly size: string;
  readonly outputFormat: string;

  readonly localBatchId?: string;
  readonly openAIBatchId?: string;
  readonly customId?: string;

  readonly estimatedCostUsd?: number;
  readonly pricingKnown: boolean;

  readonly attempt: number;
  readonly successful: boolean;
}
```

Batch summary should include:

```text
Image batch cost summary

Images planned:
Images skipped:
Images submitted:
Images completed:
Images persisted:
Images failed:
Images expired:
Images retried:

Estimated synchronous equivalent:
Estimated batch cost:
Estimated savings:
Actual reported usage:
```

Do not guess costs when pricing configuration is missing.

Plan versioned pricing configuration rather than hardcoded calculations in services.

# Batch size and splitting

OpenAI may support large batches, but the application should use lower operational limits.

Plan configurable limits such as:

```ts
interface ImageBatchLimits {
  readonly maxRequestsPerBatch: number;
  readonly maxInputFileBytes: number;
  readonly maxEstimatedCostUsd?: number;
  readonly maxEpisodesPerBatch?: number;
}
```

Recommend practical defaults after inspecting average prompt count and current episode size.

Split deterministically by:

1. endpoint;
2. model;
3. request shape;
4. output format where necessary;
5. quality where necessary;
6. configured request count;
7. estimated cost ceiling;
8. input file size.

Do not split scenes from one episode unnecessarily unless the episode exceeds a limit.

# Concurrency

Batch preparation and import are local operations.

Plan bounded concurrency for:

- prompt loading;
- hash calculation;
- image decoding;
- image validation;
- atomic persistence.

Do not decode hundreds of large base64 images simultaneously.

Recommend a conservative import concurrency such as:

```text
2–4 images
```

Make it configurable.

Synchronous generation must preserve its existing concurrency controls.

# Locking and idempotency

Reuse existing batch locks.

Plan:

- one lock per local batch during submission;
- one lock per local batch during import;
- one lock per episode manifest during updates;
- shared index lock for index updates;
- stale-lock recovery;
- idempotent repeated import;
- duplicate result detection;
- duplicate submission detection.

A repeated import must not rewrite already persisted valid images unnecessarily.

# Batch index commands

Extend existing batch commands with category filtering:

```bash
npm run stories:batches -- \
  list \
  --category image-generation
```

```bash
npm run stories:batches -- \
  latest \
  --category image-generation \
  --episode 002
```

```bash
npm run stories:batches -- \
  pending \
  --category image-generation
```

```bash
npm run stories:batches -- \
  ready \
  --category image-generation
```

```bash
npm run stories:batches -- \
  failed \
  --category image-generation
```

Do not create separate lookup commands unless the existing CLI architecture requires it.

# Dry-run requirements

The future image batch dry run must show:

- episode;
- source prompt manifest;
- number of scene prompts found;
- valid existing images skipped;
- stale images;
- missing images;
- jobs selected;
- jobs excluded;
- endpoint;
- model;
- quality;
- size;
- output format;
- estimated request count;
- planned JSONL files;
- planned local batch IDs;
- planned custom IDs;
- estimated synchronous cost;
- estimated batch cost;
- expected savings;
- character-reference dependencies;
- unsupported jobs requiring synchronous processing.

It must not:

- call OpenAI;
- write production images;
- modify batch index;
- update production manifests.

# Validate-only requirements

Plan validation commands that check:

- prompt files;
- scene IDs;
- duplicate scene IDs;
- output paths;
- custom IDs;
- image model compatibility;
- size compatibility;
- quality compatibility;
- output format compatibility;
- character references;
- existing images;
- image dimensions;
- manifest consistency;
- batch-index consistency;
- render readiness.

No OpenAI calls.

# Architecture planning

The final plan should propose exact module changes after repository inspection.

Potential modules may include:

```text
src/story-images/
  image-processing-mode.ts
  scene-image-job-planner.ts
  scene-image-job-validator.ts
  synchronous-image-generation.service.ts
  image-output.service.ts
  image-validation.service.ts
  image-readiness.service.ts
  image-cost.service.ts

src/story-batches/
  image-batch-request-builder.ts
  image-batch-planner.ts
  image-batch-manifest.types.ts
  image-batch-manifest.schemas.ts
  image-batch-result-parser.ts
  image-batch-import.service.ts
  image-batch-retry.service.ts
```

Do not recommend these blindly.

Map proposed responsibilities to actual discovered modules.

# Testing plan

The planning document must specify exact unit and integration tests.

At minimum include:

## Unit tests

1. existing synchronous behavior remains unchanged;
2. batch-mode option parsing;
3. scene prompt loading;
4. one job per prompt;
5. deterministic custom IDs;
6. duplicate custom-ID rejection;
7. prompt hash calculation;
8. configuration hash calculation;
9. valid existing image skipping;
10. stale image selection;
11. invalid image selection;
12. unsupported image model rejection;
13. unsupported size rejection;
14. unsupported quality rejection;
15. JSONL generation;
16. one request per line;
17. `n=1`;
18. correct endpoint;
19. no local metadata in API body;
20. manifest creation;
21. shared index extension;
22. old index migration;
23. result mapping by custom ID;
24. output-order independence;
25. valid base64 decoding;
26. invalid base64 rejection;
27. MIME validation;
28. dimension validation;
29. atomic image persistence;
30. successful image preservation;
31. partial success handling;
32. retry selection;
33. successful scene exclusion from retry;
34. policy rejection classification;
35. safe prompt-repair limit;
36. cost aggregation;
37. render-readiness report;
38. import concurrency limit;
39. idempotent import;
40. duplicate submission prevention.

## Integration tests with mocked OpenAI clients

1. prepare one episode batch;
2. prepare multiple episodes;
3. upload JSONL;
4. create image batch;
5. persist local and OpenAI IDs;
6. shared index entry creation;
7. status refresh;
8. completed output download;
9. error output download;
10. result order different from input;
11. successful base64 image import;
12. multiple successful image imports;
13. one failed scene with others succeeding;
14. failed scene retry only;
15. expired batch partial import;
16. missing result handling;
17. invalid base64 handling;
18. image decode failure;
19. invalid dimensions;
20. existing valid image skip;
21. forced regeneration;
22. synchronous one-scene generation;
23. no automatic sync fallback;
24. explicit sync fallback;
25. character-reference-dependent scene routing;
26. unsupported reference request remains synchronous;
27. policy-repaired retry;
28. no infinite retry;
29. episode manifest updates;
30. render readiness after complete import;
31. render blocked with missing images;
32. dry run makes no API requests;
33. validate-only makes no API requests;
34. repeated import is idempotent;
35. machine restart followed by status and import;
36. index rebuild includes image batches;
37. cleanup preserves production images;
38. cost report includes batch versus sync comparison.

Do not make real API calls in tests.

# Migration plan

The document must include a backward-compatible migration strategy for:

- existing scene prompt data;
- existing generated images;
- existing episode manifests;
- existing image cost records;
- existing batch index entries;
- existing CLI behavior;
- existing synchronous retries.

Do not require regeneration of all existing images.

Do not invalidate images merely because batch support was added.

# Security and operational safeguards

The plan must include:

- no API keys in JSONL;
- no secrets in custom IDs;
- no base64 image data in logs;
- no base64 image data in manifests;
- size limits before decoding;
- path traversal prevention;
- validated repository-relative output paths;
- atomic files;
- bounded decoding concurrency;
- batch and episode locks;
- safe restart behavior;
- no implicit charges during dry run;
- explicit `--submit` requirement;
- no automatic synchronous fallback.

# Planning document structure

Write the planning document with these sections:

1. Executive summary
2. Repository findings
3. Existing implementation map
4. Reuse/refactor decisions
5. Current synchronous image flow
6. Proposed batch image flow
7. Endpoint and SDK capability findings
8. Data models and schema changes
9. Shared batch-index changes
10. Manifest changes
11. JSONL request shape
12. Custom-ID strategy
13. Result import and image decoding
14. Character-reference handling
15. Image validation and persistence
16. Retry and policy-repair behavior
17. Scene and episode manifest integration
18. Video render-readiness integration
19. CLI changes
20. Configuration changes
21. Cost tracking
22. Locking and idempotency
23. Migration strategy
24. Security considerations
25. Phased implementation tasks
26. Unit-test plan
27. Integration-test plan
28. Validation commands
29. Risks and mitigations
30. Open questions and assumptions
31. Definition of done

# Required implementation phases

The plan must split implementation into reviewable phases.

Recommended phases:

## Phase 1 — Repository discovery and compatibility design

- map existing image and batch code;
- document synchronous behavior;
- decide reuse strategy;
- identify SDK capability constraints.

## Phase 2 — Shared types and index migration

- processing mode;
- batch category;
- image manifest types;
- schema migration;
- configuration.

## Phase 3 — Image batch planning and JSONL

- prompt loading;
- job creation;
- cache checks;
- grouping;
- custom IDs;
- JSONL generation;
- dry run.

## Phase 4 — Submission and lifecycle

- upload;
- batch creation;
- status;
- index updates;
- locks;
- recovery.

## Phase 5 — Result import

- output download;
- JSONL parsing;
- base64 decoding;
- validation;
- atomic persistence;
- manifest updates.

## Phase 6 — Retry and partial failure

- failure classification;
- expired jobs;
- policy repair;
- retry lineage;
- synchronous targeted fallback.

## Phase 7 — Render integration and reporting

- image readiness;
- episode status;
- cost reports;
- production summaries.

## Phase 8 — Tests and hardening

- migration tests;
- unit tests;
- integration tests;
- lint;
- type checking;
- documentation.

For each phase include:

- objective;
- exact files to add;
- exact files to modify;
- public APIs;
- dependencies;
- migration risks;
- tests;
- validation commands;
- completion criteria.

# Questions to resolve through repository inspection

Answer these in the plan wherever possible:

1. Where are English full-video scene prompts currently stored?
2. Are prompts persisted or created only in memory?
3. Which service currently calls `client.images.generate`?
4. Which GPT Image model is configured?
5. Which image size, quality, and format are used?
6. Are scene images generated with text-only prompts or reference images?
7. Does the existing image path use `/v1/images/edits`?
8. How are character reference images supplied?
9. What is the current scene image filename convention?
10. How does the renderer find scene images?
11. What constitutes a complete image set?
12. Are existing retries scene-specific?
13. How are image costs currently calculated?
14. Does the existing batch index support categories?
15. Can current manifests be extended compatibly?
16. Which installed OpenAI SDK version is used?
17. Does that SDK expose all required batch and file methods?
18. Are batch output files already downloaded through the SDK?
19. Is `sharp` or another image decoder installed?
20. What concurrency is safe during result import?

Do not ask the user questions that repository inspection can answer.

# Required final response after planning

After creating the planning document, respond with:

1. the saved plan path;
2. a concise summary of the existing synchronous image pipeline;
3. the recommended reuse strategy;
4. the proposed batch lifecycle;
5. the recommended default processing mode;
6. any blocking uncertainty that cannot be resolved from the repository;
7. the first implementation command to give Codex after approval.

Do not modify production code in this planning step.
