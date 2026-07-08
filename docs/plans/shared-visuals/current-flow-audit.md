# Current Flow Audit: Shared Visuals

Date: 2026-07-08

## Entry Points

- CLI surface is primarily `apps/cli/src/index.ts`.
- Image batch commands are in `apps/cli/src/images-batch-commands.ts`.
- Shared path identity is centralized in `packages/shared/src/episode-filesystem.ts`.
- Full/short image planning lives in `packages/image-generation/src/image-batch-planner.ts`.
- Image prompt and scene image planning live in `packages/image-generation/src/episode-image-pipeline.ts`.
- FFmpeg rendering consumes `ScenePlan` plus image/audio directories in `packages/rendering/src/index.ts`.
- Existing supported locales are `en`, `de`, `es`, `fr`, `pt`; `sp` is rejected.

## Current Artifacts And Paths

- Authored full script: `episodes/<episode>/languages/script-<locale>.md`.
- Authored short script: `episodes/<episode>/languages/short/script-<locale>.md`.
- Runtime locale root: `<episode>/locales/<locale>/<variant>/`.
- Current full shared generated images: `<episode>/shared/images/generated/`.
- Current short shared generated images: `<episode>/shared/short/images/generated/`.
- Current canonical full scene plan resolver: `<episode>/canonical/scenes.json`.
- Current short scene plan loader in image batch planning: `<episode>/<language>/short/scenes.json`.
- Visual retention state: `<episode>/state/visual-retention/`.

## Current Assumptions

- Full image batch planning loads one canonical scene plan, then loops over requested languages and aliases equivalent shared outputs.
- Localized full scripts are required before full image batch planning, but images are still written to shared full output paths.
- Short image planning currently loads a language-specific short scene plan.
- Short image planning can derive portrait assets from landscape images under `shared/images/generated`.
- Renderer default image directories are variant-aware when no override is supplied: full uses `shared/images/generated`, short uses `shared/short/images/generated`.
- Renderer still resolves images by scene order and expected filenames from `ScenePlan`, with legacy candidates.

## Language-Specific Logic

- Locale normalization is strict in `packages/shared/src/episode-filesystem.ts`.
- `prepareFullSceneImageBatches` loops over requested languages and validates each localized full script.
- `prepareShortSceneImageBatches` loops over languages and loads each language short scene plan.
- CLI narration and render commands parse language strings and normalize to the supported locale set.

## Variant-Specific Logic

- `ContentVariant` is `full | short`.
- Full and short have distinct shared image directories in the existing resolver.
- Full batch planning uses canonical scenes.
- Short batch planning uses short-specific logic and a short image manifest, but may reuse full landscape images as portrait source material.
- Renderer chooses default image directory from render aspect ratio.

## Coupling And Risks

- English/canonical full generation is coupled to full image output because `canonical/scenes.json` is the full source.
- Localized full languages may alias shared image outputs, but there is no canonical visual manifest that records language-agnostic visual beats and image paths.
- Short videos currently risk full-image dependency because `planShortsImageWork` is called with `landscapeDir: shared/images/generated`.
- Per-language short scene plans can diverge structurally before image planning.
- Renderer path resolution is variant-aware, but it can still use caller-provided `imageDir` overrides and legacy candidates.
- There is no required localized alignment manifest that maps localized narration timing to canonical scene IDs before render.

