# Task 14: Scene, Image, Render, And Publish Separation Plan

## 1. Scope And Non-Goals

Scope:

- Make scene planning, image prompt generation, image generation/reuse, rendering, thumbnails, upload metadata, and YouTube upload explicit downstream artifact owners.
- Preserve existing CLI commands and external artifact paths.
- Make full and short media workflows explicit, including vertical short requirements.
- Ensure media-stage changes invalidate only media-stage artifacts, not narration.

Non-goals:

- Do not redesign narration, validation, repair, metadata, or audio ownership; Tasks 11-13 own those.
- Do not replace sync image generation, batch image generation, rendering, or YouTube upload packages.
- Do not create duplicate variant, locale, lineage, or persistence abstractions; Task 16 owns persistence/cache normalization.
- Do not make paid API calls.

## 2. Confirmed Repository Findings

- `apps/cli` is the primary operator surface for media commands.
- `docs/architecture/media-implementation-inventory.md` classifies canonical media owners and active legacy paths.
- `packages/image-generation/src/episode-image-pipeline.ts` owns canonical sync image planning/generation and manifests.
- `packages/image-generation/src/shorts-image-strategy.ts` owns tested shorts image strategy behavior.
- `packages/rendering/src/index.ts` owns the renderer port, FFmpeg renderer, hybrid renderer, clip manifests, and backfill utilities.
- `packages/metadata/src/youtube-metadata.ts` owns AI-backed YouTube metadata.
- `packages/youtube-upload/src/index.ts` owns upload resolution and upload reports.
- `packages/dark-truth/src/index.ts` and `apps/cli/src/episode-commands.ts` remain active legacy orchestration paths for episode workflows.

## 3. Dependencies And Assumptions From Tasks 08-10

- Media stages consume validated full/short narration artifacts and parent linkage finalized by Tasks 08-10.
- Short vertical media dependencies must use final short artifact identity, parent full hash, language, locale, and variant fields.
- Prompt diagnostics, repair history, and validation internals are not media-stage dependencies except as manifest metadata for observability.

## 4. Target Architecture And Ownership

- Scene planning owns full scene plans and short beat-to-scene or short scene plans.
- Image planning owns prompt manifests and prompt hashes.
- Image generation owns landscape images, vertical short images, reuse strategy, and image manifests.
- Rendering owns full `youtube` profile renders and short `vertical` profile renders.
- Thumbnail generation/lookup owns thumbnail artifacts and must not decide narration validity.
- Upload metadata and YouTube upload own publication artifacts and upload reports.

## 5. File-By-File Change Plan

- `apps/cli/src/index.ts`: preserve existing `images`, `render`, `metadata`, and `youtube upload` commands while adding dry-run/assertion coverage for variant-aware dependencies where needed.
- `apps/cli/src/episode-commands.ts`: preserve `episode` commands and characterize full/short paths before moving any ownership boundaries.
- `packages/image-generation/src/episode-image-pipeline.ts`: ensure full image manifests depend on scene/image inputs, not narration prompts.
- `packages/image-generation/src/shorts-image-strategy.ts`: make short requirements explicit: 9:16, short duration, short scene count, safe text placement, and parent full-video linkage.
- `packages/rendering/src/index.ts`: verify render profiles and invalidation inputs distinguish `youtube` full and `vertical` short outputs.
- `packages/metadata/src/youtube-metadata.ts` and `packages/youtube-upload/src/index.ts`: ensure upload metadata is variant-aware without changing current command surfaces.
- `packages/shared/src/episode-filesystem.ts`: use existing path resolver where appropriate; do not introduce incompatible paths.

## 6. Compatibility And Migration

- Preserve all existing operator commands and artifact paths.
- Keep legacy `dark-truth` orchestration active until parity and migration are proven.
- Add dependency metadata additively to manifests where possible.
- Renderer changes invalidate rendered media only; scene planner changes invalidate scene and visual artifacts only; thumbnail changes do not invalidate narration.

## 7. Tests And Verification Commands

- `pnpm test:unit -- apps/cli/src/index.unit.test.ts`
- `pnpm test:unit -- apps/cli/src/episode-commands.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/shorts-image-strategy.unit.test.ts`
- `pnpm test:unit -- packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `pnpm test:unit -- packages/rendering/src/index.unit.test.ts`
- `pnpm test:unit -- packages/youtube-upload/src/index.unit.test.ts`

## 8. Ordered Implementation Steps

1. Verify Tasks 10 and 13 final narration, metadata, audio, transcript, and parent-linkage artifact fields.
2. Add characterization tests for current full and short media paths.
3. Add explicit stage dependency records for scene planning, image planning, image generation, render, thumbnails, upload metadata, and upload.
4. Add short vertical assertions for 9:16, duration, scene count, safe text placement, and parent linkage.
5. Ensure media stages consume validated artifacts rather than prompt diagnostics.
6. Add invalidation boundaries for media-stage changes, deferring global cache implementation to Task 16.
7. Preserve existing commands and compatibility paths throughout.

## 9. Risks

- Multiple manifest shapes overlap across sync images, batch images, shared image manifests, shorts image manifests, clip manifests, and upload reports.
- Moving legacy `dark-truth` flows too early can break multilingual episode production.
- Path normalization can break operators; use existing resolver-backed paths where possible.

## 10. Acceptance Criteria

- Downstream media stages are independent from narration generation.
- Full and short media workflows are explicit.
- Existing commands remain externally compatible.
- Full render uses `youtube` profile and short render uses vertical profile.
- Thumbnail lookup does not decide narration validity.

## 11. Post-Task-10 Verification Checklist

- Confirm final short narration artifact path and sidecar path.
- Confirm final full and short parent linkage fields.
- Confirm final artifact identity values for language, locale, variant, and owner.
- Confirm final transcript dependency paths if Tasks 08-10 affect them.
- Confirm no media stage depends on prompt diagnostics or repair internals.
