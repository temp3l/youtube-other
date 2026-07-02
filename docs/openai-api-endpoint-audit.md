# OpenAI API Endpoint Audit

Date: 2026-07-02

Installed SDK: `openai@6.45.0` from `pnpm-lock.yaml`. Its Batch API type accepts `/v1/responses`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/completions`, `/v1/moderations`, `/v1/images/generations`, `/v1/images/edits`, and `/v1/videos`; it does not list audio speech, transcriptions, or translations as batch endpoints.

## Endpoint Matrix

| Capability | Required surface | Valid TypeScript shape |
| --- | --- | --- |
| Text, reasoning, structured output | Responses API | `await client.responses.create({ model, input, text: { format } })` |
| Image generation | Images API | `await client.images.generate({ model, prompt, size, quality })` |
| Image edits | Images API | `await client.images.edit({ model, image, prompt, size, quality })` |
| Text-to-speech | Audio Speech API | `await client.audio.speech.create({ model, voice, input, response_format })` |
| Transcription | Audio Transcriptions API | `await client.audio.transcriptions.create({ model, file })` |
| Translation | Audio Translations API | `await client.audio.translations.create({ model, file })` |
| Batch | Batch API with target endpoint | `await client.batches.create({ input_file_id, endpoint, completion_window: "24h" })` |
| Files | Files API | `await client.files.create({ file, purpose })` |
| Embeddings | Embeddings API | `await client.embeddings.create({ model, input })` |
| Moderation | Moderations API | `await client.moderations.create({ model, input })` |

## Inventory

| Path | Function or class | Feature | Current surface | Model | Correct | Remediation |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/cli/src/story-short-rewrite-command.ts` | `preflightOpenAiConnectivity` | Text connectivity preflight | `client.responses.create` | CLI story model | Yes | None |
| `packages/story-localization/src/story-localization-openai-batch.ts` | `createOpenAiStoryClientWithOptions` | Text client, files, batches | OpenAI SDK Responses/Files/Batches | Caller supplied | Yes | Keep text-only wrapper scoped to story clients |
| `packages/story-localization/src/story-localization.service.ts` | `callOpenAiStructured`, connectivity preflight | Structured full/localized story output | `client.responses.create` | Story/localization config | Yes | None |
| `packages/story-localization/src/short-rewrite.service.ts` | short rewrite request helpers | Structured short rewrite output | `client.responses.create` | Short rewrite config | Yes | None |
| `packages/story-localization/src/story-production-analysis.service.ts` | `analyzeStoryProduction` | Structured story analysis | `client.responses.parse` | Validator config | Yes | None |
| `packages/story-localization/src/story-localization-batch-service.ts` | batch request builders and submitter | Batch text generation | JSONL lines and `client.batches.create` targeting `/v1/responses` | Story/localization/short config | Yes | None |
| `packages/story-localization/src/story-localization-batch-storage.ts` | `createLocalBatchManifest` | Batch metadata | default endpoint `/v1/responses` | N/A | Yes for story batches | Keep category-specific manifests for image batches |
| `packages/image-generation/src/episode-image-pipeline.ts` | `OpenAiImageProvider.generate` | Scene image generation and edits | `client.images.generate`, `client.images.edit` | `settings.model` | Yes | None |
| `packages/image-generation/src/openai-image.ts` | `generateOpenAiImageForJob` | Scene image generation | `client.images.generate` or REST `/v1/images/generations` fallback | `settings.model` | Yes | None |
| `packages/image-generation/src/thumbnail-image-generator.ts` | `ThumbnailImageGenerator.generateBackground` | Thumbnail image edit | `client.images.edit` | `config.model` | Yes | None |
| `packages/image-generation/src/image-batch-planner.ts` | `planImageBatchForEpisode`, `prepareImageBatch` | Batch image generation | JSONL lines targeting `/v1/images/generations` | `settings.model` | Yes | None |
| `packages/image-generation/src/image-batch-service.ts` | `submitImageBatch`, `importImageBatch` | Batch image submission/import | `client.files.create`, `client.batches.create` using manifest endpoint | Manifest model | Yes | None |
| `scripts/openai-generate-scene-image.sh` | shell command body | Scene image generation | `curl https://api.openai.com/v1/images/generations` | `OPENAI_IMAGE_MODEL` or default | Yes | None |
| `packages/speech/src/index.ts` | `OpenAiCompatibleSpeechProvider.synthesizeWithModel` | Text-to-speech | `client.audio.speech.create` or REST `/v1/audio/speech` fallback | Speech config | Yes | None |
| `packages/transcription/src/index.ts` | `OpenAiCompatibleTranscriptionProvider.transcribe` | Speech-to-text | `curl /v1/audio/transcriptions` | `options.model` or `gpt-4o-mini-transcribe` | Yes | None |
| `packages/metadata/src/youtube-metadata.ts` | `createOpenAiMetadataClient`, `generateYouTubeMetadata` | File upload plus structured metadata text | REST `/v1/files`, `client.responses.create` | Metadata config | Yes | None |
| `scripts/generate-youtube-metadata.sh` | shell helper | File upload plus metadata text | `curl /v1/files`, `curl /v1/responses` | `OPENAI_METADATA_MODEL` or default | Yes | None |
| `packages/transcript-cleaning/src/index.ts` | `OpenAiCompatibleTranscriptCleaner.clean` | Text cleanup | `curl /v1/chat/completions` | Cleaner config | Acceptable text endpoint, not media misuse | Consider future Responses migration if text endpoint standardization becomes required |
| `packages/rewriting/src/index.ts` | `createCurlTextTransport` | Text rewrite | `curl /v1/chat/completions` | Rewrite config | Acceptable text endpoint, not media misuse | Consider future Responses migration if text endpoint standardization becomes required |

No embeddings, moderation, or audio translation call sites were found in active source.

## Incorrect Endpoint Usage Found

No image generation, speech generation, transcription, or audio translation code routes through `responses.create`, `responses.parse`, or `/v1/responses`.

No image or audio provider extracts media from a Responses API result shape. Media parsing uses Images API `data[0].b64_json`, audio `Response.arrayBuffer()`, or transcription JSON schemas.

## Batch Verification

Story/localization batches correctly target `/v1/responses` for structured text. Image batches correctly target `/v1/images/generations`; schemas also allow `/v1/images/edits`. The installed SDK Batch type does not include `/v1/audio/speech`, `/v1/audio/transcriptions`, or `/v1/audio/translations`, so speech and transcription must stay on non-batch dedicated audio paths unless SDK/API support is added and verified.

## Configuration Review

Configuration separates text, metadata, image, speech, and transcription model settings: `OPENAI_IMAGE_*`, `OPENAI_SPEECH_*`, `MEDIAFORGE_OPENAI_TRANSCRIPTION_*`, `OPENAI_METADATA_*`, and story/localization/short model variables. `MEDIAFORGE_OPENAI_COMPATIBLE_MODEL` remains a broad fallback for compatible providers but is overridden by capability-specific speech/story settings where present. No `OPENAI_RESPONSES_MODEL`, `OPENAI_MEDIA_MODEL`, `OPENAI_GENERATION_ENDPOINT`, or `OPENAI_API_ENDPOINT` variables were found.

## Safeguards

`packages/testing/src/openai-endpoint-guard.unit.test.ts` scans production source files under `apps`, `packages`, and `scripts` to fail if image, speech, or transcription providers reference the Responses API or parse media through a Responses output/content shape. It also asserts known media providers retain dedicated Images, Audio Speech, and Audio Transcriptions endpoint usage.

## Notes

The main architectural weakness is naming: `OpenAiStoryClient` is reused by image batch submission for Files and Batches capabilities even though it also exposes `responses`. Current image batch request lines still target image endpoints correctly, but a future cleanup should split shared `files`/`batches` capability types from the story text client to make media misuse structurally harder.
