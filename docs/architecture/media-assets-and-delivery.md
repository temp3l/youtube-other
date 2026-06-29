# Media Assets And Delivery

## Scope

This document covers the operational path after scripts and scene plans exist: image generation and ownership, rendering, metadata generation, YouTube upload, and telemetry.

## Image Planning, Generation, Import, and Validation

- Image prompts are generated from scene plans with local style and negative-prompt helpers.
- Shared image ownership lives under episode-level shared directories, with canonical and legacy fallback path resolution handled by shared helpers.
- The image pipeline persists prompts, visual plans, provider request and response artifacts, manifests, checkpoints, and failure records under `state/image-generation/`.
- Resume behavior is manifest-driven. Generated scenes are skipped, retryable failures can be reprocessed, and non-retryable failures remain persisted until forced.

## Rendering

- Rendering is `ffmpeg`-based and can operate locally or through a remote SSH plus `rsync` worker.
- Scene clip manifests record hashes, render profile details, and renderer provenance for resumability and validation.
- Remote rendering is optional. When enabled, the hybrid renderer can retry remote work and fall back to local rendering if configured.
- Final outputs are validated for expected media characteristics before the pipeline treats them as complete.

## Metadata

- YouTube metadata is generated from scenes files rather than from free-form episode notes.
- The metadata package writes JSON, markdown, description, chapters, tags, pinned-comment, and generation-info outputs.
- Metadata generation supports retries, fallback models, timeout control, and optional retention of uploaded source files.

## YouTube Upload

- Upload is a separate finalization boundary after render and metadata artifacts exist.
- The upload package validates metadata, resolves locale-specific channel credentials where configured, and writes upload reports plus markdown summaries.
- Failure classes are explicit: configuration errors, validation errors, duplicate uploads, and generic upload errors with retryability attached where appropriate.

## Telemetry and Redaction

- Root npm scripts wrap the CLI with `scripts/run-with-telemetry.mjs`, which emits structured start and end events.
- Package logging uses Pino with redaction for API keys, authorization fields, cookies, access tokens, and signed URLs.

## Source References

- `packages/image-generation/src/index.ts`
- `packages/image-generation/src/episode-image-pipeline.ts`
- `packages/rendering/src/index.ts`
- `packages/metadata/src/youtube-metadata.ts`
- `packages/youtube-upload/src/index.ts`
- `packages/observability/src/index.ts`
- `scripts/run-with-telemetry.mjs`
