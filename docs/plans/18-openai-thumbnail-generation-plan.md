# Task 18: OpenAI Thumbnail Generation Plan

## 1. Scope And Non-Goals

Scope:

- Add a production thumbnail-generation stage for full-video and short-video outputs.
- Generate exact `1536x864` full thumbnails and exact `864x1536` short thumbnails.
- Support generic locales, with English and German as initial operator-facing examples.
- Use OpenAI Images through the official Node SDK and existing repository configuration, telemetry, hashing, validation, and atomic persistence conventions.
- Default to post-rendered localized typography so hook text is exact and deterministic.
- Expose the stage through a reusable typed service and a top-level `thumbnails generate` CLI command.

Non-goals:

- Do not couple thumbnail generation to story rewriting, scene image generation, rendering, publishing, or YouTube upload.
- Do not create a parallel OpenAI client, configuration system, retry framework, persistence convention, or artifact root.
- Do not hardcode Hachishakusama-specific details into the reusable prompt template.
- Do not call the real OpenAI API from unit or integration tests.

## 2. Confirmed Repository Findings

- `apps/cli` is the primary operational surface and already hosts top-level media commands.
- `packages/image-generation` owns OpenAI image generation, sharp usage, media-stage owner typing, and image stage persistence.
- `packages/image-generation/src/episode-image-pipeline.ts` already uses the official OpenAI SDK for scene image generation, `withResponse()` request IDs, telemetry, retries, and sharp validation.
- Existing scene image paths and manifests are under `state/image-generation/`; existing locale/variant thumbnail output paths are exposed by `createEpisodePathResolver().thumbnailFile(context)`.
- `@mediaforge/shared` provides `hashText`, `hashFile`, `writeJsonAtomic`, `writeBinaryAtomic`, `ensureWorkspacePath`, and path helpers.
- `@mediaforge/story-localization` exports stable JSON serialization used for prompt and source fingerprints.
- `@mediaforge/observability` records API calls, costs, generated images, and image cost estimates.
- Current image generation has compatible-size fallback behavior for scene images; thumbnail generation must not reuse that fallback because exact dimensions are required.

## 3. Target Architecture

- Add thumbnail-specific files under `packages/image-generation/src/`:
  - contracts, schemas, constants, and errors
  - deterministic prompt compiler
  - OpenAI thumbnail adapter/service
  - post-rendered typography compositor
  - persistence and manifest helpers
- Keep the canonical thumbnail output layout aligned with the existing resolver:

```text
episodes/<episode-slug>/locales/<locale>/<full|short>/thumbnails/
  thumbnail.png
  thumbnail.manifest.json
```

- Add a top-level CLI command:

```bash
mediaforge thumbnails generate \
  --episode 014-hachishakusama-the-eight-foot-woman \
  --locale en \
  --format full \
  --story-file <path> \
  --hook-text "SHE CALLED HER NAME"
```

- Require `--story-file` in the CLI so title, summary, protagonist, threat, and setting inputs are explicit and reproducible.
- Use `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`; add thumbnail-specific overrides such as `OPENAI_THUMBNAIL_MODEL`, `OPENAI_THUMBNAIL_QUALITY`, `OPENAI_THUMBNAIL_TIMEOUT_MS`, `OPENAI_THUMBNAIL_MAX_RETRIES`, `OPENAI_THUMBNAIL_TEXT_STRATEGY`, and `OPENAI_THUMBNAIL_MAX_PAYLOAD_BYTES`.

## 4. Public Contract

- Add typed input and output contracts equivalent to:
  - `ThumbnailFormat = "full" | "short"`
  - `ThumbnailTextStrategy = "model-rendered" | "post-rendered"`
  - `GenerateStoryThumbnailInput`
  - `GeneratedStoryThumbnail`
- Add `THUMBNAIL_DIMENSIONS` exactly:
  - `full`: `1536x864`, `16:9`
  - `short`: `864x1536`, `9:16`
- Add optional `emphasisWord`, `protagonistDescription`, `threatDescription`, `settingDescription`, and `referenceImagePath`.
- Validate all external input with zod at the CLI/service boundary:
  - non-empty episode slug, locale, title, summary, and hook text
  - supported format and text strategy
  - hook text max length for readability
  - safe reference image path inside workspace or episode artifact roots
  - valid response count, base64/url payload, payload size, MIME type, image decode, and exact dimensions

## 5. Prompt And Typography

- Add a deterministic `horror-thumbnail-v1` compiler with explicit prompt sections:
  - output format and dimensions
  - visual style
  - foreground subject
  - dominant threat
  - setting
  - composition
  - localized text
  - typography
  - exclusions
  - safety constraints
- Use the approved cinematic horror base style:
  - photorealistic cinematic horror
  - dark blue-black lighting
  - high contrast
  - one clear adult foreground subject
  - one dominant supernatural threat
  - simple readable composition
  - no collage, contact sheet, watermark, extra characters, gore, or sexualized content
- Compile format-specific composition:
  - `full`: landscape, left text-safe area, protagonist center-right, threat upper-right or deep background
  - `short`: vertical, left or upper-left stacked text-safe area, protagonist lower-middle or lower-right, threat upper-middle or upper-right
- For `post-rendered`, ask OpenAI for clean negative space and no text, then render exact uppercase hook text with sharp SVG overlay.
- Use a bundled/system-safe font stack through SVG text styling, not unlicensed font assets.
- Implement deterministic line wrapping, automatic font-size reduction, safe margins, black stroke/shadow, white primary words, red emphasis word, and overflow failure.
- If `emphasisWord` is absent, select a deterministic emphasized word from non-stopwords; examples should emphasize `CALLED` and `RIEF`.

## 6. OpenAI Adapter And Error Handling

- Use `new OpenAI({ apiKey, baseURL, organization, project })`.
- Request one PNG image with:
  - model default `gpt-image-2`
  - quality default `high`
  - `output_format: "png"`
  - `background: "opaque"`
  - `size: "1536x864"` or `"864x1536"`
- If SDK types lag current Images API custom-size support, isolate the compatibility cast in one documented adapter function and add a test proving the serialized request contains the exact custom dimensions.
- Support base64 response first; support image URL only if the configured response legitimately returns it.
- Retry only transient, rate-limit, timeout, conflict, or server failures with exponential backoff and jitter.
- Do not retry validation, authentication, policy, or malformed-response failures.
- Add typed thumbnail errors:
  - `ThumbnailInputError`
  - `ThumbnailPromptCompilationError`
  - `ThumbnailGenerationError`
  - `ThumbnailPolicyError`
  - `ThumbnailRateLimitError`
  - `ThumbnailAuthenticationError`
  - `ThumbnailResponseError`
  - `ThumbnailDimensionMismatchError`
  - `ThumbnailPersistenceError`
  - `ThumbnailArtifactConflictError`
- Error messages must include episode slug, locale, format, model, prompt fingerprint when available, retryability, and safe remediation guidance.
- Error messages and logs must never include API keys, authorization headers, image base64, or full sensitive source content.

## 7. Persistence, Reuse, And Telemetry

- Before calling OpenAI, compute:
  - source fingerprint from normalized input, dimensions, text strategy, quality, model, and reference image hash
  - prompt fingerprint from normalized prompt and generation parameters
- Reuse existing thumbnail artifacts only when manifest, image hash, dimensions, model, quality, text strategy, source fingerprint, prompt fingerprint, and output hash all match.
- If an existing artifact differs and `force` is false, throw `ThumbnailArtifactConflictError` with changed fields.
- If `force` is true, atomically replace only the targeted thumbnail and manifest after validating the new image.
- Keep full and short thumbnails independently invalidated; keep locales independently invalidated.
- Persist manifest fields:
  - episode slug, locale, format, dimensions, model, quality, output format, text strategy
  - prompt version, prompt fingerprint, source fingerprint, hook text, emphasis word
  - generated timestamp, image SHA-256, byte size, request ID
  - pricing version and estimated cost when telemetry provides it
- Add safe telemetry events through existing telemetry/logging:
  - `thumbnail_generation_started`
  - `thumbnail_generation_reused`
  - `thumbnail_generation_retry`
  - `thumbnail_generation_succeeded`
  - `thumbnail_generation_failed`
  - `thumbnail_generation_conflict`
- Record safe fields only: execution ID, episode slug, locale, format, model, quality, dimensions, prompt/source fingerprints, duration, bytes, retry count, output path, estimated cost, and pricing version.

## 8. CLI And Documentation

- Add `thumbnails generate` under `apps/cli/src/index.ts` or a small registered command module if extraction keeps the file manageable.
- CLI options:
  - `--episode <slug>`
  - `--locale <locale>`
  - `--format <full|short>`
  - `--hook-text <text>`
  - `--story-file <path>`
  - `--emphasis-word <word>`
  - `--quality <low|medium|high|auto>`
  - `--text-strategy <post-rendered|model-rendered>`
  - `--reference-image <path>`
  - `--force`
  - `--dry-run`
  - `--verbose`
- `--dry-run` must validate input, compile the prompt, calculate fingerprints and output paths, make no OpenAI call, write no artifacts, and omit the full prompt unless verbose.
- Update `docs/cli.md` and `docs/architecture/media-assets-and-delivery.md`.
- Add `.env.example` entries only if `.env.example` exists:

```text
OPENAI_API_KEY=
OPENAI_THUMBNAIL_MODEL=gpt-image-2
```

## 9. Tests And Verification

Add focused tests:

- Prompt compiler:
  - deterministic output
  - full and short composition differ correctly
  - localized hook text is preserved exactly
  - story fields are normalized safely
  - exclusions are always present
  - fingerprint changes on relevant input and ignores object key ordering
- Validation:
  - rejects unknown format, empty hook, oversized hook, unsafe reference paths
  - accepts generic locales
  - resolves exact full and short dimensions
- OpenAI adapter:
  - sends configured model, exact dimensions, quality, output format, and one image
  - handles valid base64
  - rejects missing images, invalid base64, oversized payloads, and dimension mismatches
  - does not retry permanent errors
  - retries transient errors within configured limits
  - never logs image payloads or credentials
- Typography compositor:
  - renders exact English and German text
  - wraps without clipping in `16:9` and `9:16`
  - highlights requested emphasis word in red
  - preserves exact final dimensions
  - is deterministic for identical input
- Persistence:
  - atomic write
  - manifest persistence
  - reuse on matching fingerprints
  - conflict on mismatched fingerprints
  - targeted force replacement
  - independent format and locale invalidation
- CLI:
  - parses full and short formats
  - dry-run makes no API call
  - non-zero exit on generation failure
  - reports output path on success

Verification commands:

```bash
pnpm test:focused -- packages/image-generation/src/story-thumbnail.unit.test.ts
pnpm test:focused -- apps/cli/src/thumbnail-commands.unit.test.ts
pnpm --filter @mediaforge/image-generation typecheck
pnpm --filter @mediaforge/cli typecheck
```

Then run targeted ESLint on changed files and the narrow package builds needed for the modified packages. Run broader build/lint only because this task explicitly requires build, lint, typecheck, and commit-level validation.

## 10. Ordered Implementation Steps

1. Add thumbnail contracts, constants, schemas, and typed errors in `packages/image-generation`.
2. Add thumbnail settings loader using existing OpenAI env/config conventions.
3. Add deterministic source and prompt fingerprint helpers using stable serialization.
4. Add prompt compiler and tests.
5. Add typography compositor and tests.
6. Add OpenAI thumbnail adapter/service with retries, response validation, request ID capture, and telemetry.
7. Add persistence manifest read/write, reuse, conflict, and force behavior.
8. Add CLI command and dry-run behavior.
9. Add docs updates and `.env.example` entry if applicable.
10. Run focused tests, repair task-caused failures within the repo budget, then typecheck, lint, build, and commit.

## 11. Acceptance Criteria

- Full thumbnail generation creates an exact `1536x864` image.
- Short thumbnail generation creates an exact `864x1536` image.
- The prompt encodes the approved cinematic horror visual system.
- English and German hook text are supported exactly, with a generic locale-aware contract.
- Post-rendered typography is the default.
- Matching artifacts are reused without OpenAI calls.
- Conflicting artifacts are not silently overwritten.
- OpenAI failures map to typed actionable errors.
- Telemetry contains no image payloads or credentials.
- Unit and integration tests use fakes or mocks only.
- Relevant tests, typecheck, lint, and build pass.
- The completed implementation is committed with a concise conventional commit.
