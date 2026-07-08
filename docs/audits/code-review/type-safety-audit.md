# Type-Safety Audit

## Summary

The codebase uses TypeScript, Zod, branded IDs, and discriminated unions in many core packages. The weak points are not broad `any` usage; they are boundary casts after `JSON.parse`, partial validation of provider/remote outputs, and stringly typed stage/path identifiers.

## Unsafe `any` Usage

Confirmed source `z.any()` usage is narrow:

- `packages/domain/src/index.ts:1856`
- `packages/domain/src/index.ts:1857`

These fields (`sourceMetadata`, `sourceMedia`) should become `z.unknown()` or schema-specific unions if consumed downstream.

## Unsafe Casts

Priority casts:

- `packages/image-generation/src/image-batch-service.ts:407`: casts OpenAI batch response body shape.
- `packages/image-generation/src/image-batch-service.ts:531` and `:552`: scene and short manifests are cast from JSON.
- `packages/image-generation/src/image-batch-storage.ts:141`: parsed manifest is normalized then cast.
- `packages/rendering/src/index.ts:1246`: clip manifest is manually checked then cast.
- `packages/rendering/src/index.ts:3385`: remote result JSON is cast inline.
- `apps/cli/src/index.ts:508`, `:3408`, `:3525`, `:3980`: CLI remote/upload/status reads use direct casts.
- `packages/dark-truth/src/index.ts:1812`, `:1827`, `:2623`: manifest reads parse unknown then rely on local assumptions.

## Non-Null Assertions

Confirmed examples:

- `apps/cli/src/episode-layout-migration-command.ts:519`
- `packages/image-generation/src/image-batch-planner.ts:295`, `:303`, `:378`, `:389`
- `packages/story-localization/src/source-story-discovery.ts:119`

Most are guarded by local length checks, but they should be replaced with explicit destructuring guards before refactors.

## Weak JSON Parsing

Direct `JSON.parse` appears at many external boundaries. Highest priorities:

- `scripts/remote-render-worker.mjs:63`, `:70`, `:129`, `:229`, `:287`
- `packages/youtube-upload/src/index.ts:702`, `:1565`
- `packages/story-localization/src/story-localization-openai-batch.ts:212`
- `packages/transcript-cleaning/src/index.ts:168`
- `packages/rewriting/src/index.ts:300`
- `packages/source-ingestion/src/index.ts:113`

Use a shared safe JSON helper returning `unknown`, then parse with Zod at the owner boundary.

## Missing Runtime Schemas

Add or enforce schemas for:

- remote render job manifests, ready markers, clip metadata, and `results.json`
- scene generation manifests and short scene manifests consumed by image batch import
- direct OpenAI image response bodies
- YouTube upload video-selection inputs
- generated narration/runtime script manifests

## Stringly Typed Identifiers

Existing branded types are good in `packages/shared` and `packages/story-localization`. Still stringly:

- OpenAI batch IDs and file IDs in image batch service
- remote job IDs and clip IDs in render worker/client boundaries
- stage IDs passed through CLI options as raw strings
- generated image destination roots and asset roles in batch identity objects

## Weak Provider Response Types

- `packages/image-generation/src/image-batch-service.ts` relies on `OpenAiBatchOutputLine` from story-localization but extracts image payload through structural casts.
- `packages/metadata/src/youtube-metadata.ts` validates final metadata well, but raw curl response bodies and file-delete responses are loosely typed.
- `packages/transcription/src/index.ts` parses OpenAI transcription responses with schemas after curl; keep that pattern and apply it to image/remote outputs.

## Recommended Improvements

- Use `unknown` plus Zod schemas for all file/provider/remote boundaries.
- Create branded provider IDs: `OpenAiBatchId`, `OpenAiFileId`, `RemoteRenderJobId`, `RemoteClipId`.
- Add discriminated unions for stage outcomes: `planned`, `skipped`, `cache-hit`, `started`, `completed`, `failed-retryable`, `failed-terminal`.
- Replace non-null assertions in planner/migration code before moving contracts.
- Prefer readonly input objects and explicit result types for recoverable pipeline failures.

## Files/Functions To Prioritize

1. `packages/process-runner/src/index.ts` telemetry arg redaction.
2. `packages/shared/src/episode-filesystem.ts` filename/path validation.
3. `packages/image-generation/src/image-batch-service.ts` provider output and manifest schemas.
4. `packages/rendering/src/index.ts` clip/remote/result schemas.
5. `scripts/remote-render-worker.mjs` runtime schema validation.
6. `packages/youtube-upload/src/index.ts` upload artifact selection contract.

