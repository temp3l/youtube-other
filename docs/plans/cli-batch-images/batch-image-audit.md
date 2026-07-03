# Batch Image Architecture Audit

## Executive Summary

Outcome: **B - Partially implemented**.

The repository contains tested image batch primitives, but it does not yet support generating all required full and short video images through a complete CLI batch workflow. Full scene batch preparation exists for English/full scene images only. Short image handling is implemented separately through deterministic transforms and synchronous generation. Reference images are tracked in manifests but not submitted as image inputs by the current batch planner.

## Components Inspected

- Package manifests and installed SDK: `package.json`, `packages/image-generation/package.json`, `node_modules/openai/package.json`, `node_modules/openai/resources/batches.d.ts`.
- CLI surfaces: `apps/cli/src/index.ts`, `apps/cli/src/images-resume-command.ts`, `apps/cli/src/images-sync-shared-command.ts`, `apps/cli/src/episode-commands.ts`, `apps/cli/src/thumbnail-commands.ts`.
- Image generation: `episode-image-pipeline.ts`, `openai-image.ts`, `image-batch-planner.ts`, `image-batch-service.ts`, `image-batch-storage.ts`, `shorts-image-strategy.ts`, `story-thumbnail.ts`.
- Rendering and paths: `packages/rendering/src/index.ts`, `packages/shared/src/episode-filesystem.ts`.
- Tests: `image-batch-planner.unit.test.ts`, `image-batch-service.unit.test.ts`, `shorts-image-strategy.unit.test.ts`, `images-resume-command.unit.test.ts`.
- Documentation: `docs/openai-api-endpoint-audit.md`, `docs/batch-cli.md`, `docs/migrations/media-consolidation-plan.md`.

## Current Full-Image Flow

The reachable CLI flow is synchronous:

1. `images plan --episode <id>` loads the episode manifest and scene plan.
2. `planEpisodeImageGeneration` creates prompts and per-scene manifests.
3. `images generate --episode <id>` calls `generateEpisodeImages`.
4. `OpenAiImageProvider.generate` uses `client.images.generate` for text-only requests and `client.images.edit` when reference images are present.
5. Output is written to shared generated-image paths and scene manifests.
6. `images resume` retries missing or retryable failed scenes.

The batch library flow is not CLI-reachable:

1. `prepareImageBatchForEpisode` loads existing scene manifests and prompt files.
2. It emits JSONL request lines targeting `/v1/images/generations`.
3. `submitImageBatch` uploads the JSONL file and calls `client.batches.create`.
4. `refreshImageBatch` stores remote lifecycle state and output/error file IDs.
5. `importImageBatch` downloads result/error files, reconciles by `custom_id`, decodes base64 images, validates MIME/dimensions, and updates scene manifests.
6. `retryFailedImageBatch` prepares a new batch for retryable failed scene IDs only.

## Current Short-Image Flow

The reachable short flow is not provider-batch based:

1. `episode short` builds a short scene plan.
2. `prepareShortsImageAssets` writes portrait images under `shared/short/images/generated`.
3. Key scenes are regenerated synchronously through `OpenAIImageGenerator.generate`.
4. Tail scenes usually reuse full landscape images through `smart-crop` or `blurred-fill`; pan-and-scan is stored as metadata.
5. `renderCleanVideo` consumes the short image directory and `shorts-image-manifest.json`.

## API Endpoint Verification

- Installed OpenAI SDK: `openai@6.44.0`.
- SDK batch type accepts `/v1/images/generations` and `/v1/images/edits`.
- Current image batch request lines use `/v1/images/generations`.
- Synchronous reference-assisted scene generation uses `client.images.edit`.
- No active image generation path was found routing through `/v1/responses`.
- Current batch request bodies do not include image inputs, so reference-assisted scene batches would lose reference semantics.

## Capability Matrix

| Capability                                         | Full video                               | Short video                     | Evidence                                                | Status               | Risks / gaps                      |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------- | ------------------------------------------------------- | -------------------- | --------------------------------- |
| CLI command exists                                 | Sync only                                | Sync/transform only             | `apps/cli/src/index.ts`, `episode-commands.ts`          | Partial              | No image batch CLI                |
| Languages can be selected                          | Sync episode workflow supports languages | Short command supports language | `episode-commands.ts`                                   | Partial              | Batch schema literal `en`         |
| Multiple episodes can be selected                  | Missing                                  | Missing                         | CLI options                                             | Missing              | One episode at a time             |
| Scene prompts prepare without API calls            | Yes, sync plan and batch planner         | Yes, short strategy planning    | planner/tests                                           | Partial              | Batch requires existing manifests |
| Reference images included                          | Sync yes                                 | Sync yes                        | `episode-image-pipeline.ts`, `shorts-image-strategy.ts` | Incorrect for batch  | Batch drops inputs                |
| Reference images generated before dependent scenes | Sync yes/manual approval                 | Sync uses registry              | `generateEpisodeImageReferences`                        | Partial              | No batch reference stage          |
| Reusable continuity/reference assets               | Character only                           | Character only                  | registry schemas                                        | Partial              | No location/object assets         |
| Images submitted with Batch API                    | Library only                             | Missing                         | `submitImageBatch`                                      | Unreachable          | No CLI                            |
| Correct endpoint used                              | Text-only yes                            | Missing                         | `/v1/images/generations`                                | Partial              | Edit semantics absent             |
| Stable `custom_id` values                          | Scene-only                               | Missing                         | `buildCustomId`                                         | Partial              | English/full only                 |
| Duplicate requests prevented                       | Reuses generated scene hash              | Short manifest reuse            | tests                                                   | Partial              | CLI submission guard absent       |
| Batch lifecycle tracked                            | Library only                             | Missing                         | `image-batch-service.ts`                                | Unreachable          | No operator command               |
| Completed results downloaded                       | Library only                             | Missing                         | `importImageBatch`                                      | Unreachable          | No CLI                            |
| Reconcile independent of order                     | Yes                                      | N/A                             | `Map(custom_id)`                                        | Complete for library | Needs CLI coverage                |
| Error files processed                              | Yes                                      | N/A                             | `error_file_id` path                                    | Complete for library | Needs CLI coverage                |
| Partial success supported                          | Yes                                      | N/A                             | service test                                            | Complete for library | Needs CLI coverage                |
| Retry failed only                                  | Yes                                      | N/A                             | retry test                                              | Partial              | Path assumptions need hardening   |
| MIME/dimensions validated                          | Yes                                      | Short transform uses Sharp      | service/strategy                                        | Partial              | Aspect policy incomplete          |
| Localized prompts tied correctly                   | Sync workflow yes                        | Short yes                       | episode command                                         | Missing in batch     | Batch `language: "en"`            |
| Asset filenames canonical                          | Mostly                                   | Mostly                          | shared/rendering tests                                  | Partial              | Batch identity not variant-aware  |
| Renderer consumes files                            | Yes                                      | Yes                             | `renderCleanVideo`                                      | Complete             | Needs batch status gate           |
| Dry-run/prepare-only                               | Planner exists                           | Strategy plan exists            | tests                                                   | Partial              | No batch CLI                      |
| Request generation tests                           | Yes                                      | Short strategy tests            | unit tests                                              | Partial              | No reference/edit JSONL tests     |
| Retry/resume tests                                 | Library only                             | Short cache tests               | unit tests                                              | Partial              | No CLI lifecycle tests            |
| Batch limits/splitting                             | Missing                                  | Missing                         | no evidence                                             | Missing              | Large jobs not split              |

## Findings By Severity

### Critical - Reference inputs are silently dropped by image batches

Evidence: `episode-image-pipeline.ts` switches to `client.images.edit` when references are present. `image-batch-planner.ts` records `characterReferenceHashes` but always emits `/v1/images/generations` without image inputs.

Impact: paid batch scene requests can generate incorrect character continuity.

Remediation: model request operations explicitly and use `/v1/images/edits` only where the installed SDK and request JSONL schema support input images.

Required tests: text-only generation JSONL, reference-assisted edit JSONL, and a regression proving references are not silently dropped.

### High - Image batch workflow is unreachable from CLI

Evidence: `apps/cli/src/index.ts` registers `images plan`, `generate`, `resume`, and `sync-shared`, but no `images batch` commands call image batch service exports.

Impact: operators cannot run the batch workflow end to end.

Remediation: add `images batch prepare|submit|status|download|resume`.

Required tests: command registration and mocked lifecycle command tests.

### High - Batch schema supports only English full scene images

Evidence: `image-batch.types.ts` and `image-batch.schemas.ts` use `language: "en"` and `format: "full"` literals.

Impact: localized full images and short images cannot be represented.

Remediation: expand identity and manifest schema to include language, variant, asset role, dependency hashes, model, size, quality, and operation.

Required tests: localized full, short generated, transformed short, and reference asset identities.

### High - Short image batch processing is missing

Evidence: `shorts-image-strategy.ts` uses local transforms and synchronous generator calls.

Impact: key short scenes cannot be prepared/submitted/imported through image batches.

Remediation: preserve deterministic transforms and batch only native short regeneration candidates.

Required tests: regenerate/reuse/transform classification and batch request selection.

### Medium - Docs overstate current image batch readiness

Evidence: `docs/openai-api-endpoint-audit.md` marks image batches correct without noting CLI unreachability or reference-input loss.

Impact: operators may assume complete support.

Remediation: update docs after implementation.

Required tests: docs path/command verification and Mermaid check.

## Recommended Target Architecture

Use a staged provider-batch executor inside the canonical image pipeline. It should produce deterministic request manifests, upload exactly one immutable JSONL per batch, poll lifecycle state, download output/error files, reconcile by stable identity, validate images, place assets under canonical shared paths, and retry only missing or failed assets.

## Implementation Task Summary

Nine tasks are defined under `docs/plans/cli-batch-images/tasks/`. Each task requires a separate commit after implementation with the commit message specified at the top of that task file.

## Parallelization Guidance

Task 03 and Task 05 can be prepared in parallel after Task 02. Task 07 can be designed while Task 04 is active but should not merge until reference semantics are implemented. Task 09 can draft docs early but must finalize last.

## Verification Strategy

Use focused Vitest runs and docs checks only. Do not submit API batches, create paid images, mutate episode fixtures, or run broad build/test commands unless explicitly authorized.

## Residual Risks

- OpenAI batch image edit JSONL shape may require additional verification beyond SDK endpoint typing.
- Existing episode manifests may need compatibility normalization.
- Short native generation policy is partly product-quality dependent.
- Large batch splitting has no current implementation evidence.

## Documentation Created

- `docs/plans/cli-batch-images/README.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`
- `docs/plans/cli-batch-images/tasks/*.md`

## Exact Files Changed By This Audit Task

This audit task creates only documentation under `docs/plans/cli-batch-images/`.
