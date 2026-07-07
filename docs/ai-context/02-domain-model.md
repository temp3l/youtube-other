# AI Context: Domain Model

## Core Concepts

- Episode: workspace root under `episodes/<episode-id>`.
- Story: authored/generated narrative content.
- Full video: `variant=full`, usually 16:9 render profile.
- Short video: `variant=short`, usually vertical/portrait workflow.
- Language/localization: supported locale set is `en`, `de`, `es`, `fr`, `pt`.
- Scene: structured unit for narration/visual/image/render planning.
- Narration segment: speech chunk or segment consumed by audio assembly and captions.
- Image prompt: text input for scene/reference generation.
- Reference image: character/location/object/continuity asset used by scene generation.
- Scene image: full or short generated visual asset.
- Generated asset: output under resolver-owned image/audio/video/metadata paths.
- Batch image job: OpenAI batch item with custom ID, identity, destination, and status.
- Provider import/download flow: prepare JSONL, submit, refresh/download results, import outputs, report failures.
- FFmpeg render: render request consumes scenes/images/audio/captions and writes video + manifest.
- Motion preset: render-time FFmpeg motion selection, seeded and optionally debug-reported.
- Visual branch boundary: story workflow state that separates story decisions from media generation.
- Manifest/store/cache: workflow manifests, image batch manifests, source identities, cache fingerprints, retry state.

## Workflow Manifest Model

`packages/story-localization/src/story-workflow.types.ts` defines `story-workflow-manifest-v1`.

Stage types include source ingest, full rewrite/validation/quality, localization, short rewrite/validation/quality, scene extraction, visual model, image prompt/generation, thumbnail, audio, captions, metadata, render, and publish.

Stage statuses include `planned`, `running`, `succeeded`, `failed`, `blocked`, `skipped`, `cancelled`, and `cached`.

Artifact provenances include `source`, `generated`, `source-fallback`, `localized-fallback`, `cache`, `manual`, `imported`, and `legacy-compatibility`.

## Image Batch Model

`packages/image-generation/src/image-batch.types.ts` defines `image-batch-v2`.

Important fields:

- Asset identity: episode, language, variant, role, operation, subject, prompt hash, model, size, quality, dependency hashes, destination, identity hash.
- Item status: planned/submitted/provider result/imported/failure/retry.
- Destination roots include shared generated images, shared short generated images, shared references, and thumbnails.
- Short multilingual shared portrait aliases now use owner/follower metadata in the dirty tree.

## Unknowns

- Real provider semantics for batch `/v1/images/edits` image/file inputs are unknown.
- Production readiness for stale repository episode artifacts, especially episode `022-the-whistler-in-the-woods`, needs verification.
