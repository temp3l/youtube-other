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
- Shared image ownership lives under episode-level shared directories, with migration-only stale image candidates classified by shared helpers where older state still needs inspection.
- Canonical shared scene-image specs are exact and variant-specific: full-video generated images must be `1536x864`, short-video generated images must be `864x1536`.
- Final render specs stay separate from generation specs: full-video renders are `1920x1080`, short-video renders are `1080x1920`.
- `OPENAI_IMAGE_SIZE` is only the backward-compatible fallback for full-video generation. Short generation must come from `OPENAI_IMAGE_SHORT_SIZE`, `YOUTUBE_SHORT_IMAGE_SIZE`, or the typed default `864x1536`.
- Using `1920x1080` as the default OpenAI request size is incorrect for the story pipeline because it conflates provider image generation with downstream video rendering and weakens manifest reuse validation.
- The image pipeline persists prompts, visual plans, provider request and response artifacts, manifests, checkpoints, and failure records under `state/image-generation/`.
- Image-generation manifests now record additive stage dependencies for narration, scene-plan, and image-plan lineage, plus prompt and configuration fingerprints.
- Resume and reuse behavior are manifest-driven, but file existence alone is not accepted as valid. The pipeline inspects the actual image file and fails fast when the stored dimensions do not match the canonical spec for that variant.
- Short image preparation keeps the short variant separate, requires `9:16`, records safe vertical composition, focal-subject placement, text-safe guidance, and optional parent full-video linkage in the shorts manifest, and validates the stored portrait generation asset at `864x1536` before rendering.
- Localized full-video runs reuse canonical shared full images only after the shared manifest entries and the actual files on disk pass the same dimension contract.
- Recovery for invalid existing assets: delete the invalid shared image files plus the affected shared image manifest, then rerun the canonical English full image step for full assets or the short image preparation step for short assets. Do not keep rendering from a manifest that points at invalid files.
- If an older episode already contains `1920x1080` full shared images or `1080x1920` short shared images in the image manifest, treat them as invalid generation assets, remove the manifest entries and files, and resume the image stage so the pipeline regenerates or revalidates against the correct generation size.

## Rendering

- Rendering is `ffmpeg`-based and can operate locally or through a remote SSH plus `rsync` worker.
- Scene clip manifests record hashes, render profile details, and renderer provenance for resumability and validation.
- Final render manifests are explicit downstream `render` artifacts. They are variant-aware, preserve upstream dependency fingerprints, and enforce `youtube` for full outputs versus portrait `vertical` for shorts.
- Thumbnail generation is a separate `thumbnail` ownership stage under locale plus variant roots. Full thumbnails are exact `1536x864`; short thumbnails are exact `864x1536`.
- Thumbnail manifests sit beside the image output at `locales/<locale>/<full|short>/thumbnails/thumbnail.manifest.json` and record prompt plus source fingerprints, quality, model, text strategy, output hash, request id, and estimated cost metadata.
- Default thumbnail text handling is post-rendered localized typography, so operator-supplied hook text stays exact and deterministic even when the base image is model-generated.
- Remote rendering is optional. When enabled, the hybrid renderer can retry remote work and fall back to local rendering if configured.
- Final outputs are validated for expected media characteristics before the pipeline treats them as complete.
- Render failures do not invalidate narration, scene plans, or completed image artifacts.
- The CLI exposes `render remote check` for remote host preflight, `render remote verify` and `render remote test` for a deterministic remote render probe, `render remote status` for job summaries, `render remote logs` for per-job or per-clip log retrieval, and `render remote cleanup` for stale workspace removal.
- `render remote status` reads remote job state from `<REMOTE_RENDER_BASE_DIR>/jobs` over SSH and summarizes clip metadata, counts, and optional tailed log excerpts.
- `render remote logs` expects a job id and can narrow output to a single clip with `--clip` and a tail length with `--tail`.

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
