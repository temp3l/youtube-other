# Media Assets And Delivery

## Scope

This document covers the operational path after scripts and scene plans exist: image generation and ownership, rendering, metadata generation, YouTube upload, and telemetry.

The active downstream media path is:

```text
validated narration
  -> scene plan
  -> image plan
  -> generated or reused images
  -> render
  -> thumbnail
  -> publication
```

Full and short media stay separate. Metadata and audio remain sibling or downstream concerns with independent ownership.

## Image Planning, Generation, Import, and Validation

- Scene plans are treated as explicit downstream artifacts of validated narration, with narration fingerprint, locale, variant, and planning configuration recorded in the persisted visual-plan artifacts.
- Image prompts are generated from scene plans with local style and negative-prompt helpers.
- Shared image ownership lives under episode-level shared directories, with canonical and legacy fallback path resolution handled by shared helpers.
- The image pipeline persists prompts, visual plans, provider request and response artifacts, manifests, checkpoints, and failure records under `state/image-generation/`.
- Image-generation manifests now record additive stage dependencies for narration, scene-plan, and image-plan lineage, plus prompt and configuration fingerprints.
- Resume behavior is manifest-driven. Generated scenes are skipped, retryable failures can be reprocessed, and non-retryable failures remain persisted until forced.
- Short image preparation keeps the short variant separate, requires `9:16`, and records safe vertical composition, focal-subject placement, text-safe guidance, and optional parent full-video linkage in the shorts manifest.

## Rendering

- Rendering is `ffmpeg`-based and can operate locally or through a remote SSH plus `rsync` worker.
- Scene clip manifests record hashes, render profile details, and renderer provenance for resumability and validation.
- Final render manifests are explicit downstream `render` artifacts. They are variant-aware, preserve upstream dependency fingerprints, and enforce `youtube` for full outputs versus portrait `vertical` for shorts.
- Remote rendering is optional. When enabled, the hybrid renderer can retry remote work and fall back to local rendering if configured.
- Final outputs are validated for expected media characteristics before the pipeline treats them as complete.
- Render failures do not invalidate narration, scene plans, or completed image artifacts.

## Metadata

- YouTube metadata is generated from scenes files rather than from free-form episode notes.
- The metadata package writes JSON, markdown, description, chapters, tags, pinned-comment, and generation-info outputs.
- Metadata generation supports retries, fallback models, timeout control, and optional retention of uploaded source files.

## YouTube Upload

- Upload is a separate terminal publication boundary after render, metadata, and thumbnail artifacts exist.
- The upload package validates metadata, resolves locale-specific channel credentials where configured, and writes upload reports plus markdown summaries.
- Publication reports now record variant-aware render and thumbnail dependencies, publication fingerprints, and retry-safe request identity without persisting OAuth secrets.
- Failure classes are explicit: configuration errors, validation errors, duplicate uploads, and generic upload errors with retryability attached where appropriate.
- Upload failures update only the publication report and do not invalidate narration, scene planning, image generation, or completed renders.

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
