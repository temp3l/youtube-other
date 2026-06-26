Take the role of a senior TypeScript/Node.js engineer working on a production-grade automated YouTube media-generation pipeline.

Refactor this repository so that:

1. All image generation and image editing stop using the Responses API and instead use the dedicated OpenAI Images API directly.
2. All text-to-speech generation stops using the Responses API and instead uses the dedicated OpenAI Audio Speech API directly.
3. The Responses API remains available only for genuine text analysis, script processing, scene extraction, metadata generation, prompt creation, structured data generation, and other non-image/non-audio reasoning tasks.

Do not only describe the changes. Inspect the repository, implement the refactor, run validation, and provide an execution report.

# Primary API migration requirements

Replace all Responses API image-generation implementations such as:

```ts
await openai.responses.create({
  model: "...",
  input: prompt,
  tools: [{ type: "image_generation" }],
});
```

with the direct Images API:

```ts
await openai.images.generate({
  model: "gpt-image-2",
  prompt,
  size: "1920x1088",
  quality: "medium",
});
```

For recurring-character references, image edits, masks, or reference-guided scene generation, use:

```ts
await openai.images.edit({
  model: "gpt-image-2",
  images,
  prompt,
  size: "1920x1088",
  quality: "medium",
});
```

Use the exact parameter names and types supported by the installed official OpenAI Node.js SDK version.

Replace all Responses API TTS implementations with the direct Audio Speech API:

```ts
const response = await openai.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "onyx",
  input: narrationText,
  instructions: voiceInstructions,
  response_format: "wav",
});
```

The underlying REST endpoint must be:

```text
POST /v1/audio/speech
```

Do not generate speech using:

- `openai.responses.create()`
- Responses API audio output
- the Realtime API
- Chat Completions
- an image-generation tool
- browser automation
- shell calls to undocumented endpoints

Use the official OpenAI Node.js SDK directly.

# Repository inspection

Before changing code, search the repository for all relevant implementations and usages, including:

```text
responses.create
client.responses.create
openai.responses.create
image_generation
tools:
audio
speech
tts
text-to-speech
output_audio
audio output
modalities
images.generate
images.edit
audio.speech.create
/v1/responses
/v1/images
/v1/audio/speech
```

Inspect:

- OpenAI client wrappers
- media-generation services
- image services
- TTS services
- audio services
- scene workers
- CLI commands
- batch processors
- orchestration services
- retry helpers
- configuration files
- environment-variable loaders
- manifests
- tests
- package versions
- downstream FFmpeg/video assembly code

Do not scan:

- `node_modules`
- generated image directories
- generated audio directories
- rendered videos
- build output
- caches
- coverage output
- `.git`
- large binary files

Identify every call path that generates an image or speech audio, including indirect wrappers.

# Architecture

Reuse the repository’s existing architecture and naming conventions.

If a shared OpenAI client already exists, extend it instead of creating multiple competing OpenAI clients.

Create or refactor dedicated services such as:

```text
OpenAIImageService
OpenAITtsService
OpenAIAudioService
```

Suitable file names may include:

```text
src/services/openai-image.service.ts
src/services/openai-tts.service.ts
src/services/openai-client.ts
```

Adapt these locations to the actual project structure.

Keep image rendering and TTS rendering separate from text reasoning.

The intended architecture is:

```text
Story/script
    ↓
Text model creates scenes, prompts and narration metadata
    ↓
Direct Images API renders scene images
    ↓
Direct Audio Speech API renders narration audio
    ↓
FFmpeg combines images, audio and video assets
```

Do not invoke a text/reasoning model once per image or audio chunk unless it is genuinely necessary. Finalize prompts and voice instructions before calling the dedicated media endpoints.

# Direct image-generation implementation

Implement strongly typed methods such as:

```ts
generateImage(...)
generateSceneImage(...)
generateCharacterReference(...)
editImage(...)
generateImageBatch(...)
```

Create suitable types where needed, for example:

```ts
OpenAIImageConfig;
ImageGenerationRequest;
SceneImageGenerationRequest;
CharacterReferenceGenerationRequest;
ImageEditRequest;
ImageGenerationResult;
ImageGenerationManifestEntry;
```

Use strict TypeScript.

Do not introduce:

```ts
any
as any
@ts-ignore
@ts-expect-error
```

unless an unavoidable third-party SDK type defect exists. If one exists, isolate and document the workaround and add a test.

## Image configuration

Support the repository’s existing environment/configuration conventions.

Add or update values similar to:

```env
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_SIZE=1920x1088
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_FORMAT=webp
OPENAI_IMAGE_COMPRESSION=90
OPENAI_IMAGE_CONCURRENCY=1
OPENAI_IMAGE_MAX_RETRIES=2
OPENAI_IMAGE_TIMEOUT_MS=180000
```

Defaults:

```text
model: gpt-image-2
size: 1920x1088
quality: medium
format: webp
compression: 90
concurrency: 1
max retries: 2
timeout: 180000 ms
```

Validate configuration during startup.

Use the direct API only after the scene prompt is finalized.

For text-only scene images:

```ts
await openai.images.generate(...)
```

For scenes using recurring-character references:

```ts
await openai.images.edit(...)
```

Do not call the Responses API to render, modify, transform, extend, or regenerate an image.

## Image response handling

GPT Image responses normally contain base64 image data.

Implement centralized reusable handling that:

1. Confirms image data exists.
2. Decodes the base64 safely.
3. Writes to a temporary file.
4. Verifies the temporary file is non-empty.
5. Atomically renames the temporary file to the final output path.
6. Deletes temporary files after failures.
7. Updates manifests only after successful writes.

Example paths:

```text
output/generated-assets/images/scene-001.webp
output/generated-assets/images/scene-001.webp.tmp
output/generated-assets/characters/{character-id}/reference.webp
```

Preserve the repository’s existing filenames and directory structure whenever possible.

Never generate:

- collages
- contact sheets
- combined scene images
- sprite sheets
- multiple thumbnails inside one image

## Recurring-character handling

Preserve the existing recurring-character workflow.

Requirements:

- maximum three recurring main protagonists per story
- generate canonical references only for characters that visually recur
- reuse valid existing references
- attach only the references needed for the current scene
- never attach unrelated character references
- do not regenerate references unless missing, invalid, or forced
- preserve face, approximate age, hairstyle, body type, clothing identity and distinguishing features
- allow changes to pose, expression, action, lighting, framing and environment
- preserve existing scene-to-character mappings
- preserve downstream manifest compatibility

Where the installed SDK supports reference fidelity, use the appropriate supported option. Do not send unsupported parameters to `gpt-image-2`.

# Direct TTS implementation

Create or refactor a dedicated TTS service using:

```ts
await openai.audio.speech.create(...)
```

The TTS service should expose strongly typed methods such as:

```ts
generateSpeech(...)
generateNarration(...)
generateNarrationChunk(...)
generateSpeechBatch(...)
concatenateNarrationChunks(...)
```

Create suitable types such as:

```ts
OpenAITtsConfig;
SpeechGenerationRequest;
NarrationGenerationRequest;
NarrationChunkRequest;
SpeechGenerationResult;
SpeechManifestEntry;
VoiceInstructions;
```

## TTS configuration

Add or update configuration similar to:

```env
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=onyx
OPENAI_TTS_FORMAT=wav
OPENAI_TTS_SPEED=1.0
OPENAI_TTS_CONCURRENCY=1
OPENAI_TTS_MAX_RETRIES=2
OPENAI_TTS_TIMEOUT_MS=180000
OPENAI_TTS_MAX_INPUT_CHARS=3500
```

Use these defaults unless the repository already defines deliberate alternatives:

```text
model: gpt-4o-mini-tts
voice: onyx
format: wav
speed: 1.0
concurrency: 1
max retries: 2
timeout: 180000 ms
maximum chunk length: 3500 characters
```

Do not hard-code the API key.

Validate:

- supported output format
- non-empty text input
- valid timeout
- valid concurrency
- valid retry count
- valid chunk length
- configured model
- configured voice

## Voice instructions

Preserve existing episode-specific audio-generation instructions.

For Dark Truth Episodes, retain the intended default narration profile:

```text
Use one consistent adult male narrator.

Speak in natural English with a restrained dark-documentary horror tone.

Target approximately 175–185 words per minute.

Begin calmly and build tension steadily.

Keep dialogue grounded and believable.

Avoid theatrical acting, exaggerated emotion, advertising energy, shouting and
unnaturally long pauses.

Use brief silence only where explicitly requested by the story.

Maintain consistent voice identity, pacing, pronunciation and volume across all
chunks.

Do not narrate headings, Markdown, metadata, production notes, sound-effect
labels or audio-generation instructions.
```

Pass supported speaking instructions through the dedicated Speech API request.

Do not accidentally include production instructions as spoken narration.

Separate:

- narration text
- voice instructions
- sound-design instructions
- metadata
- headings
- Markdown syntax

Only narration text may be sent as the `input` field.

## TTS chunking

If narration exceeds endpoint or project limits, split it into chunks before calling TTS.

Chunking requirements:

- split only at sentence boundaries
- prefer paragraph boundaries
- never split inside a word
- never split inside quoted dialogue when avoidable
- preserve original narration order
- preserve punctuation
- avoid chunks containing only headings or whitespace
- remove duplicate narration headings
- do not narrate Markdown or metadata
- retain stable voice instructions for every chunk
- assign deterministic chunk IDs and filenames

Example filenames:

```text
output/generated-assets/audio/chunk-001.wav
output/generated-assets/audio/chunk-002.wav
output/generated-assets/audio/narration.wav
```

If an existing chunk is valid and skip-existing mode is enabled, reuse it.

If force mode is enabled, regenerate it.

Store chunk metadata sufficient to reproduce the narration:

```json
{
  "chunkId": "chunk-001",
  "sequenceNumber": 1,
  "sourceTextHash": "sha256",
  "model": "gpt-4o-mini-tts",
  "voice": "onyx",
  "format": "wav",
  "outputPath": "output/generated-assets/audio/chunk-001.wav",
  "attemptCount": 1,
  "status": "success",
  "generatedAt": "ISO-8601 timestamp",
  "error": null
}
```

Do not store API keys or binary audio in manifests.

## TTS response handling

The SDK response should be handled as binary audio.

Use the SDK’s supported binary conversion method, typically equivalent to:

```ts
const response = await openai.audio.speech.create({
  model,
  voice,
  input,
  instructions,
  response_format: "wav",
});

const arrayBuffer = await response.arrayBuffer();
const audioBuffer = Buffer.from(arrayBuffer);
```

Adapt this to the installed SDK version.

Then:

1. Validate that the response contains audio.
2. Convert it to a Node.js `Buffer`.
3. Write it to a temporary file.
4. Confirm that the file is non-empty.
5. Validate the file with FFprobe when FFprobe is available.
6. Atomically rename it to the final filename.
7. Remove temporary files after failure.
8. Update the manifest only after a successful write.

Do not parse speech output as:

- JSON
- base64 image data
- a Responses API output item
- a text completion
- an SSE event unless explicitly using supported streaming

## Audio concatenation

Preserve the current narration assembly behavior.

When combining WAV chunks:

- first inspect their sample rate, channels, codec and sample format
- normalize incompatible chunks before concatenation
- concatenate without audible gaps where possible
- avoid clipping
- preserve narration order
- create one final narration file
- ensure the final audio duration is available to downstream scene-timing logic

Use FFmpeg or the project’s existing audio utility.

Prefer lossless WAV during intermediate processing.

Do not repeatedly encode audio through lossy formats.

If final MP3 or AAC output is required, encode only once at the final stage.

# Shared retry behavior

Implement or reuse a central retry helper.

Retry only transient failures, including:

- HTTP 429
- HTTP 500, 502, 503 and 504
- network reset
- connection timeout
- temporary DNS errors
- SDK timeout
- service-unavailable errors

Use capped exponential backoff with jitter.

Do not retry:

- invalid request errors
- malformed parameters
- unsupported model errors
- authentication failures
- permission failures
- billing or insufficient-quota failures
- moderation rejections
- empty input
- missing required files
- invalid configuration

Respect the configured maximum retry count.

Include the OpenAI request ID in error logs when available.

# Concurrency

Preserve or improve concurrency controls.

Use separate limits for:

```text
image generation concurrency
TTS generation concurrency
```

Default both to `1` to minimize rate-limit and quota problems.

Do not create unbounded `Promise.all()` batches.

Use the project’s existing queue implementation if one exists.

# Timeouts and cancellation

Apply request timeouts consistently.

Ensure failed or timed-out requests do not leave:

- partial image files
- partial audio files
- locked files
- unresolved promises
- invalid success records
- hanging workers

Use `AbortController` or the SDK’s supported timeout configuration where appropriate.

# Logging

Every direct image request should log:

```text
API: images.generate or images.edit
asset or scene ID
model
size
quality
format
reference-image count
attempt number
elapsed time
output path
status
failure category
request ID when available
```

Every direct TTS request should log:

```text
API: audio.speech.create
chunk or narration ID
model
voice
format
input character count
attempt number
elapsed time
output path
status
failure category
request ID when available
```

Do not log:

- API keys
- authorization headers
- full base64 image payloads
- raw audio buffers
- entire long scripts unnecessarily
- sensitive environment variables

# Manifests

Preserve existing manifest formats and downstream compatibility where possible.

Add backward-compatible fields only when useful.

Example image manifest entry:

```json
{
  "sceneId": "scene-001",
  "api": "images.generate",
  "model": "gpt-image-2",
  "size": "1920x1088",
  "quality": "medium",
  "outputFormat": "webp",
  "outputPath": "output/generated-assets/images/scene-001.webp",
  "recurringCharacterIds": [],
  "referenceImagePaths": [],
  "attemptCount": 1,
  "generationStatus": "success",
  "generatedAt": "ISO-8601 timestamp",
  "error": null
}
```

Example TTS manifest entry:

```json
{
  "chunkId": "chunk-001",
  "api": "audio.speech.create",
  "model": "gpt-4o-mini-tts",
  "voice": "onyx",
  "outputFormat": "wav",
  "outputPath": "output/generated-assets/audio/chunk-001.wav",
  "sourceTextHash": "sha256",
  "inputCharacterCount": 3210,
  "attemptCount": 1,
  "generationStatus": "success",
  "generatedAt": "ISO-8601 timestamp",
  "error": null
}
```

# Cost optimization

The purpose of this refactor is to remove unnecessary Responses API orchestration charges for media rendering.

Therefore:

- build final image prompts before calling the Images API
- build final narration text and voice instructions before calling the Speech API
- call each dedicated endpoint once per finalized asset whenever possible
- avoid sending the complete repository or complete story context with each media call
- do not invoke a reasoning model merely to forward existing content
- reuse recurring-character references
- reuse valid generated files
- hash prompts and narration chunks to detect unchanged assets
- do not regenerate unchanged assets
- do not make real paid API calls during tests
- do not generate test images or test speech during implementation

# SDK compatibility

Inspect the installed `openai` package version.

If it does not support:

```ts
openai.images.generate(...)
openai.images.edit(...)
openai.audio.speech.create(...)
gpt-image-2
1920x1088 image output
gpt-4o-mini-tts
speech instructions
```

update it to the newest stable compatible version and update the lockfile.

Use the actual SDK’s current method signatures and TypeScript types rather than guessing.

Do not use raw `fetch`, `curl`, Axios or handcrafted HTTP calls when the official SDK supports the endpoint.

# Environment documentation

Update `.env.example` or equivalent documentation with the new configuration.

Do not overwrite real `.env` secrets.

Remove obsolete environment variables used only by Responses-based image or TTS generation after confirming they are unused.

Do not remove variables still used for text-generation workflows.

# Tests

Add or update focused unit tests.

Image tests must cover:

- `images.generate()` request construction
- `images.edit()` request construction
- generation without character references
- generation with one character reference
- generation with multiple relevant references
- base64 decoding
- atomic file writing
- invalid or empty response handling
- transient retry behavior
- non-retryable failures
- retry limit
- timeout behavior
- skip-existing behavior
- force-regeneration behavior
- configuration defaults
- invalid configuration
- manifest updates
- confirmation that image rendering never calls `responses.create()`

TTS tests must cover:

- `audio.speech.create()` request construction
- model and voice configuration
- narration input separation from production instructions
- sentence-boundary chunking
- deterministic chunk filenames
- binary response handling
- atomic audio writing
- empty response handling
- transient retries
- non-retryable failures
- retry limit
- timeout behavior
- skip-existing behavior
- force-regeneration behavior
- manifest updates
- final chunk ordering
- confirmation that speech generation never calls `responses.create()`

Mock the official OpenAI SDK.

No automated test may make a paid API request.

# Cleanup validation

After implementation, search the entire relevant source tree again for:

```text
responses.create
client.responses.create
openai.responses.create
image_generation
output_audio
modalities
audio.speech.create
images.generate
images.edit
```

Classify each remaining Responses API usage.

A remaining `responses.create()` call is allowed only when it performs text or structured-data generation and does not request:

- image output
- image-generation tools
- speech output
- audio output
- audio modalities

There must be no remaining Responses API path used for:

- image generation
- image editing
- image transformation
- recurring-character image generation
- TTS
- narration generation
- speech rendering
- audio rendering

Remove:

- obsolete Responses-based image helpers
- obsolete Responses-based TTS helpers
- dead code
- unused imports
- unused types
- duplicate OpenAI clients
- obsolete media configuration

# Build and validation

Detect and use the repository’s actual package manager.

Run the relevant equivalents of:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For a monorepo, run the appropriate workspace commands.

Fix all errors caused by this refactor.

Do not hide failures.

Clearly distinguish:

- existing unrelated failures
- failures introduced by this refactor
- commands that passed
- commands that could not run and why

# Scope control

Keep the changes focused.

Do not:

- refactor unrelated application areas
- redesign the complete project
- change video content
- alter episode scripts
- regenerate images
- regenerate audio
- render videos
- upload videos
- make paid API calls
- modify generated media
- delete valid existing outputs
- change public interfaces unnecessarily

Preserve downstream video generation and YouTube upload behavior.

# Required final report

At completion, provide:

1. Summary of the image migration
2. Summary of the TTS migration
3. Files added
4. Files modified
5. Files removed
6. OpenAI SDK version before and after
7. Environment/configuration changes
8. Tests added or updated
9. Commands executed and results
10. Existing unrelated failures
11. Assumptions
12. Remaining limitations
13. Example direct `images.generate()` flow
14. Example direct `images.edit()` flow
15. Example direct `audio.speech.create()` flow
16. Confirmation that image rendering no longer uses the Responses API
17. Confirmation that TTS no longer uses the Responses API
18. Confirmation that remaining Responses API calls are text/structured-output operations only
19. Confirmation that no paid image or TTS calls were made during implementation or testing

Begin by inspecting the relevant repository files and dependency versions. Then implement the refactor, update tests and configuration, run validation, and provide the report.
